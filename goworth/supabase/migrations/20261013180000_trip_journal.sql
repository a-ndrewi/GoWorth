create table public.trip_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id text not null,
  start_date date not null,
  end_date date not null,
  budget numeric(12,2) not null,
  companions text not null,
  interests text[] not null default '{}',
  activities jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  saved_place_ids text[] not null default '{}',
  reflection text not null default '',
  status text not null,
  archived_at timestamptz not null default now(),
  constraint journal_status_valid check (status in ('completed', 'replaced')),
  constraint journal_reflection_length check (char_length(reflection) <= 1200)
);

create index trip_journal_user_date_idx
  on public.trip_journal_entries (user_id, archived_at desc);

alter table public.trip_journal_entries enable row level security;
revoke all on public.trip_journal_entries from anon, authenticated;
grant select, insert, update, delete on public.trip_journal_entries to authenticated;
create policy "Manage own trip journal" on public.trip_journal_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.archive_trip(p_status text) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  current_trip public.trips%rowtype;
  entry_id uuid;
begin
  if owner_id is null then
    raise exception 'Sign in required';
  end if;
  if p_status not in ('completed', 'replaced') then
    raise exception 'Invalid archive status';
  end if;

  select * into current_trip from public.trips
  where user_id = owner_id for update;
  if not found then
    return null;
  end if;

  insert into public.trip_journal_entries (
    user_id, destination_id, start_date, end_date, budget, companions,
    interests, activities, expenses, saved_place_ids, reflection, status
  ) values (
    owner_id, current_trip.destination_id, current_trip.start_date,
    current_trip.end_date, current_trip.budget, current_trip.companions,
    current_trip.interests,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'day', day, 'period', period,
      'time', activity_time, 'name', name, 'note', note
    ) order by position) from public.trip_activities where user_id = owner_id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'label', label, 'category', category, 'amount', amount
    ) order by position) from public.trip_expenses where user_id = owner_id), '[]'::jsonb),
    coalesce((select array_agg(item_id) from public.saved_items
      where user_id = owner_id and kind = 'place'), '{}'::text[]),
    coalesce((select journal from public.travel_memories where user_id = owner_id), ''),
    p_status
  ) returning id into entry_id;

  delete from public.trips where user_id = owner_id;
  update public.travel_memories set journal = '', updated_at = now()
    where user_id = owner_id;
  return entry_id;
end;
$$;

revoke all on function public.archive_trip(text) from public;
grant execute on function public.archive_trip(text) to authenticated;

create or replace function public.replace_trip(
  p_destination_id text,
  p_start_date date,
  p_end_date date,
  p_budget numeric,
  p_companions text,
  p_interests text[],
  p_activities jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
begin
  if owner_id is null then
    raise exception 'Sign in required';
  end if;

  perform public.archive_trip('replaced');

  insert into public.trips
    (user_id, destination_id, start_date, end_date, budget, companions, interests)
  values
    (owner_id, p_destination_id, p_start_date, p_end_date, p_budget,
     p_companions, p_interests);

  insert into public.trip_activities
    (user_id, id, day, period, activity_time, name, note, position)
  select owner_id, item.id, item.day, item.period, item.activity_time,
    item.name, item.note, item.position
  from jsonb_to_recordset(coalesce(p_activities, '[]'::jsonb)) as item(
    id text, day integer, period text, activity_time text,
    name text, note text, position integer
  );
end;
$$;
