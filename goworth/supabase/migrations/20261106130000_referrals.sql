-- Invite a friend: every account has a personal code. A new account that enters it within its first 14 days
-- wins one month of Premium for itself and one for the friend who invited it. Like a month won on the wheel,
-- each month starts after any Premium already active, bought or won, so the months add up.

-- One code per account, made the first time it is asked for. Unambiguous letters and digits only.
create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
revoke all on public.referral_codes from anon, authenticated;

-- Who joined with whose code. The email fingerprint outlives a deleted account, so deleting an account and
-- signing up again with the same address cannot win another month. Both sides lose their link when deleted.
create table if not exists public.referral_redemptions (
  id bigint generated always as identity primary key,
  referrer_id uuid references auth.users(id) on delete set null,
  referred_id uuid unique references auth.users(id) on delete set null,
  email_fingerprint text not null unique,
  referrer_rewarded boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists referral_redemptions_referrer_idx on public.referral_redemptions (referrer_id, created_at);
alter table public.referral_redemptions enable row level security;
revoke all on public.referral_redemptions from anon, authenticated;

-- A friend who invites many people earns at most this many months in any 12 months; the people they invite
-- always get theirs.
create or replace function public.referral_reward_cap() returns integer language sql immutable as $$ select 12 $$;

-- The same address written another way (capitals, or name+tag@) is the same person.
create or replace function public.email_fingerprint(p_email text) returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(p_email)), '\+[^@]*@', '@'), 'UTF8')), 'hex');
$$;
revoke all on function public.email_fingerprint(text) from public, anon, authenticated;

-- Adds one month of Premium after whatever Premium the account already has, from the wheel, a store purchase or
-- an earlier referral. Nothing to add to Lifetime.
create or replace function public.grant_premium_month(p_user uuid, p_provider text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare current_plan record;
begin
  select * into current_plan from public.effective_plan(p_user);
  if current_plan.plan = 'lifetime' then return false; end if;
  insert into public.user_entitlements as e (user_id,plan,valid_until,provider,updated_at)
  values (p_user,'premium',greatest(now(), coalesce(current_plan.valid_until, now())) + interval '1 month',p_provider,now())
  on conflict (user_id) do update set plan = 'premium',
    valid_until = greatest(now(), coalesce(current_plan.valid_until, now()),
      case when e.plan = 'premium' then coalesce(e.valid_until, now()) else now() end) + interval '1 month',
    provider = p_provider, provider_reference = null, updated_at = now();
  return true;
end;
$$;
revoke all on function public.grant_premium_month(uuid, text) from public, anon, authenticated;

create or replace function public.ensure_referral_code(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
declare candidate text;
declare existing text;
begin
  select code into existing from public.referral_codes where user_id = p_user;
  if existing is not null then return existing; end if;
  loop
    candidate := (select pg_catalog.string_agg(pg_catalog.substr(alphabet, 1 + pg_catalog.floor(pg_catalog.random() * 32)::int, 1), '')
      from pg_catalog.generate_series(1, 6));
    begin
      insert into public.referral_codes (user_id, code) values (p_user, candidate);
      return candidate;
    exception when unique_violation then
      select code into existing from public.referral_codes where user_id = p_user;
      if existing is not null then return existing; end if;
    end;
  end loop;
end;
$$;
revoke all on function public.ensure_referral_code(uuid) from public, anon, authenticated;

-- The caller's code, how many friends joined with it, and whether the caller can still enter a friend's code.
create or replace function public.my_referral() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
declare account record;
declare joined record;
begin
  if caller is null then raise exception 'Sign in required'; end if;
  select created_at, email into account from auth.users where id = caller;
  select count(*) as friends, count(*) filter (where referrer_rewarded) as months into joined
    from public.referral_redemptions where referrer_id = caller;
  return pg_catalog.jsonb_build_object(
    'code', public.ensure_referral_code(caller),
    'friends', joined.friends,
    'monthsEarned', joined.months,
    'redeemed', exists (select 1 from public.referral_redemptions where referred_id = caller),
    'redeemUntil', case when not exists (select 1 from public.referral_redemptions
        where referred_id = caller or email_fingerprint = public.email_fingerprint(account.email))
      and account.created_at > now() - interval '14 days' then account.created_at + interval '14 days' end
  );
end;
$$;
revoke all on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;

create or replace function public.redeem_referral(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
declare account record;
declare clean text := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
declare referrer uuid;
declare fingerprint text;
declare earned integer;
declare rewarded boolean := false;
declare result record;
begin
  if caller is null then raise exception 'Sign in required'; end if;
  select created_at, email, email_confirmed_at into account from auth.users where id = caller;
  if account.email is null or account.email_confirmed_at is null then raise exception 'Confirm your email before using an invite code'; end if;
  fingerprint := public.email_fingerprint(account.email);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('referral:' || fingerprint));
  if exists (select 1 from public.referral_redemptions where referred_id = caller or email_fingerprint = fingerprint) then
    raise exception 'You have already used an invite code';
  end if;
  if account.created_at <= now() - interval '14 days' then raise exception 'Invite codes work only in the first 14 days of a new account'; end if;
  select user_id into referrer from public.referral_codes where code = clean;
  if referrer is null then raise exception 'This invite code does not exist'; end if;
  if referrer = caller then raise exception 'You cannot use your own invite code'; end if;
  -- Two new accounts cannot invite each other for a month each.
  if exists (select 1 from public.referral_redemptions where referrer_id = caller and referred_id = referrer) then
    raise exception 'You invited this friend, so you cannot use their code';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('referrer:' || referrer::text));
  select count(*) into earned from public.referral_redemptions
    where referrer_id = referrer and referrer_rewarded and created_at > now() - interval '12 months';
  if earned < public.referral_reward_cap() then rewarded := public.grant_premium_month(referrer, 'referral'); end if;
  perform public.grant_premium_month(caller, 'referral');
  insert into public.referral_redemptions (referrer_id, referred_id, email_fingerprint, referrer_rewarded)
    values (referrer, caller, fingerprint, rewarded);

  select * into result from public.effective_plan(caller);
  return pg_catalog.jsonb_build_object('plan', result.plan, 'validUntil', result.valid_until);
end;
$$;
revoke all on function public.redeem_referral(text) from public, anon;
grant execute on function public.redeem_referral(text) to authenticated;
