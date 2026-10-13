create table public.discovery_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('destination', 'place')),
  item_id text not null,
  created_at timestamptz not null default now()
);

create index discovery_activity_recent_idx on public.discovery_activity (created_at desc);
alter table public.discovery_activity enable row level security;
revoke all on public.discovery_activity from anon, authenticated;
grant insert on public.discovery_activity to authenticated;
create policy "Record own discoveries" on public.discovery_activity
  for insert to authenticated with check ((select auth.uid()) = user_id);

create function public.recent_discoveries()
returns table (kind text, item_id text, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select recent.kind, recent.item_id, recent.created_at
  from (
    select distinct on (activity.kind, activity.item_id)
      activity.kind, activity.item_id, activity.created_at
    from public.discovery_activity as activity
    where activity.user_id <> (select auth.uid())
    order by activity.kind, activity.item_id, activity.created_at desc
  ) as recent
  order by recent.created_at desc
  limit 8;
$$;

revoke all on function public.recent_discoveries() from public;
grant execute on function public.recent_discoveries() to authenticated;
