-- Premium is not sold. Accounts win it from a daily wheel; the odds and the 24-hour
-- cooldown live here so a modified client cannot pick its own prize or spin again early.
-- Keep the odds in sync with src/lib/wheel-odds.ts, which shows them to users.

-- Stripe ran in test mode only; test purchases do not carry over.
update public.user_entitlements
set plan = 'free', valid_until = null, provider = null, provider_reference = null, updated_at = now()
where provider = 'stripe';

create table if not exists public.wheel_spins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  prize text not null check (prize in ('none','premium_month','lifetime')),
  created_at timestamptz not null default now()
);
create index if not exists wheel_spins_user_idx on public.wheel_spins(user_id,created_at desc);
alter table public.wheel_spins enable row level security;
revoke all on public.wheel_spins from anon, authenticated;
grant select on public.wheel_spins to authenticated;
drop policy if exists "Read own spins" on public.wheel_spins;
create policy "Read own spins" on public.wheel_spins for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.premium_wheel_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare last_spin timestamptz;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  select max(created_at) into last_spin from public.wheel_spins where user_id = owner_id;
  return pg_catalog.jsonb_build_object(
    'serverNow', now(),
    'nextSpinAt', case when last_spin > now() - interval '24 hours' then last_spin + interval '24 hours' end
  );
end;
$$;
revoke all on function public.premium_wheel_status() from public, anon;
grant execute on function public.premium_wheel_status() to authenticated;

create or replace function public.spin_premium_wheel() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare last_spin timestamptz;
declare current_plan text;
declare roll double precision;
declare won text;
declare result public.user_entitlements%rowtype;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('wheel:' || owner_id::text));
  select plan into current_plan from public.user_entitlements where user_id = owner_id;
  if current_plan = 'lifetime' then raise exception 'Lifetime access is already active'; end if;
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
    -- A month won during active Premium is added after the current end date.
    insert into public.user_entitlements as e (user_id,plan,valid_until,provider,updated_at)
    values (owner_id,'premium',now() + interval '1 month','wheel',now())
    on conflict (user_id) do update set plan = 'premium',
      valid_until = greatest(now(), case when e.plan = 'premium' then coalesce(e.valid_until, now()) else now() end) + interval '1 month',
      provider = 'wheel', provider_reference = null, updated_at = now();
  end if;

  select * into result from public.user_entitlements where user_id = owner_id;
  return pg_catalog.jsonb_build_object(
    'prize', won,
    'plan', case when result.plan = 'lifetime' or (result.plan = 'premium' and result.valid_until > now())
      then result.plan else 'free' end,
    'validUntil', result.valid_until,
    'serverNow', now(),
    'nextSpinAt', now() + interval '24 hours'
  );
end;
$$;
revoke all on function public.spin_premium_wheel() from public, anon;
grant execute on function public.spin_premium_wheel() to authenticated;
