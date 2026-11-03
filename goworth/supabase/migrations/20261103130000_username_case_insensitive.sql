-- Usernames are how travellers find each other, so "Andrei" and "andrei" must not both exist.
-- The existing unique constraint is case-sensitive; this index makes uniqueness ignore case.
-- It fails if two accounts already differ only by case; rename one of them first.
create unique index if not exists profiles_username_lower_idx on public.profiles (pg_catalog.lower(username)) where username is not null;

-- Lets the sign-up form and the username screen say whether a username is free before it is saved.
-- Callable before sign-in; it reveals only whether a name is taken, which search shows anyway.
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_username, '') ~ '^[A-Za-z0-9_]{3,24}$' and not exists (
    select 1 from public.profiles p
    where pg_catalog.lower(p.username) = pg_catalog.lower(p_username)
      and p.user_id is distinct from (select auth.uid()));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
