create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
begin
  if owner_id is null then
    raise exception 'Sign in required';
  end if;
  delete from auth.users where id = owner_id;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
