-- Premium is now also sold: monthly and yearly subscriptions and a one-time Lifetime purchase through the
-- App Store and Google Play, handled by RevenueCat. Store purchases are kept apart from wheel prizes in
-- user_entitlements, so a renewal or an expiry never erases a month won on the wheel; the plan that counts
-- is the better of the two. Only the revenuecat-sync Edge Function (service role) writes store_entitlements.

create table if not exists public.store_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','premium','lifetime')),
  valid_until timestamptz,
  product_id text,
  store text,
  sandbox boolean not null default false,
  will_renew boolean,
  refreshed_at timestamptz not null default now(),
  constraint store_premium_has_expiry check (plan <> 'premium' or valid_until is not null)
);
alter table public.store_entitlements enable row level security;
revoke all on public.store_entitlements from anon, authenticated;
grant select on public.store_entitlements to authenticated;
drop policy if exists "Read own store entitlement" on public.store_entitlements;
create policy "Read own store entitlement" on public.store_entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

-- The plan in force for an account: Lifetime from either source wins, otherwise the later Premium end date.
create or replace function public.effective_plan(p_user uuid, out plan text, out valid_until timestamptz)
language sql stable security definer set search_path = '' as $$
  with sources as (
    select e.plan, e.valid_until from public.user_entitlements e where e.user_id = p_user
    union all
    select s.plan, s.valid_until from public.store_entitlements s where s.user_id = p_user
  ), best as (
    select bool_or(sources.plan = 'lifetime') as lifetime,
      max(sources.valid_until) filter (where sources.plan = 'premium' and sources.valid_until > now()) as premium_until
    from sources
  )
  select case when coalesce(best.lifetime, false) then 'lifetime' when best.premium_until is not null then 'premium' else 'free' end,
    case when coalesce(best.lifetime, false) then null else best.premium_until end
  from best;
$$;
revoke all on function public.effective_plan(uuid) from public, anon, authenticated;

create or replace function public.my_membership() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare current public.store_entitlements%rowtype;
declare effective record;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  select * into effective from public.effective_plan(owner_id);
  select * into current from public.store_entitlements where user_id = owner_id and plan <> 'free';
  return pg_catalog.jsonb_build_object(
    'plan', effective.plan,
    'validUntil', effective.valid_until,
    'storeProduct', current.product_id,
    'store', current.store,
    'willRenew', current.will_renew
  );
end;
$$;
revoke all on function public.my_membership() from public, anon;
grant execute on function public.my_membership() to authenticated;

-- Free limits now read the effective plan, so a store purchase lifts them as soon as it is synced.
create or replace function public.consume_free_allowance() returns trigger language plpgsql
security definer set search_path = '' as $$
declare usage_kind text;
declare usage_item_id text;
declare allowance integer;
declare used integer;
declare active_plan text;
begin
  if new.user_id is distinct from (select auth.uid()) then raise exception 'Not your account'; end if;
  if tg_table_name = 'trips' then
    usage_kind := 'trip';
    usage_item_id := new.destination_id;
  else
    usage_kind := new.kind;
    usage_item_id := new.item_id;
    if exists (select 1 from public.saved_items
      where user_id = new.user_id and kind = usage_kind and item_id = usage_item_id)
      or exists (select 1 from public.usage_events
        where user_id = new.user_id and kind = usage_kind and item_id = usage_item_id
        and created_at >= pg_catalog.date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')
    then return new; end if;
  end if;
  allowance := case when usage_kind = 'trip' then 1 else 5 end;
  select plan into active_plan from public.effective_plan(new.user_id);
  if coalesce(active_plan,'free') <> 'free' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.user_id::text));
  select count(*) into used from public.usage_events
  where user_id = new.user_id and kind = usage_kind
    and created_at >= pg_catalog.date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  if used >= allowance then raise exception 'Free monthly % limit reached (%). Upgrade for unlimited access',usage_kind,allowance; end if;
  insert into public.usage_events(user_id,kind,item_id)
  values (new.user_id,usage_kind,usage_item_id);
  return new;
end;
$$;

-- The wheel stays free for everyone without Lifetime. A month won while Premium is active, bought or won,
-- starts after the current end date.
create or replace function public.spin_premium_wheel() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare last_spin timestamptz;
declare current_plan record;
declare roll double precision;
declare won text;
declare result record;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wheel:' || owner_id::text));
  select * into current_plan from public.effective_plan(owner_id);
  if current_plan.plan = 'lifetime' then raise exception 'Lifetime access is already active'; end if;
  select max(created_at) into last_spin from public.wheel_spins where user_id = owner_id;
  if last_spin > now() - interval '24 hours' then raise exception 'Wheel cooldown active'; end if;

  roll := pg_catalog.random();
  won := case when roll < 0.0002 then 'lifetime' when roll < 0.0102 then 'premium_month' else 'none' end;
  insert into public.wheel_spins(user_id,prize) values (owner_id,won);

  if won = 'lifetime' then
    insert into public.user_entitlements as e (user_id,plan,valid_until,provider,updated_at)
    values (owner_id,'lifetime',null,'wheel',now())
    on conflict (user_id) do update set plan = 'lifetime', valid_until = null, provider = 'wheel',
      provider_reference = null, updated_at = now();
  elsif won = 'premium_month' then
    insert into public.user_entitlements as e (user_id,plan,valid_until,provider,updated_at)
    values (owner_id,'premium',greatest(now(), coalesce(current_plan.valid_until, now())) + interval '1 month','wheel',now())
    on conflict (user_id) do update set plan = 'premium',
      valid_until = greatest(now(), coalesce(current_plan.valid_until, now()),
        case when e.plan = 'premium' then coalesce(e.valid_until, now()) else now() end) + interval '1 month',
      provider = 'wheel', provider_reference = null, updated_at = now();
  end if;

  select * into result from public.effective_plan(owner_id);
  return pg_catalog.jsonb_build_object(
    'prize', won,
    'plan', result.plan,
    'validUntil', result.valid_until,
    'serverNow', now(),
    'nextSpinAt', now() + interval '24 hours'
  );
end;
$$;
revoke all on function public.spin_premium_wheel() from public, anon;
grant execute on function public.spin_premium_wheel() to authenticated;
