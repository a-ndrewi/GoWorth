create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  username text unique,
  notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint profile_name_length check (char_length(display_name) <= 50),
  constraint profile_username_format check (username is null or username ~ '^[A-Za-z0-9_]{3,24}$')
);

create table public.travel_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interests text[] not null default '{}',
  region text not null default 'Europe',
  budget numeric(12,2) not null default 2500,
  pace text not null default 'Balanced',
  updated_at timestamptz not null default now(),
  constraint preference_budget_nonnegative check (budget >= 0)
);

create table public.trips (
  user_id uuid primary key references auth.users(id) on delete cascade,
  destination_id text not null,
  start_date date not null,
  end_date date not null,
  budget numeric(12,2) not null,
  companions text not null,
  interests text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint trip_dates_ordered check (end_date >= start_date),
  constraint trip_budget_nonnegative check (budget >= 0)
);

create table public.trip_activities (
  user_id uuid not null references public.trips(user_id) on delete cascade,
  id text not null,
  day integer not null,
  period text not null,
  activity_time text not null,
  name text not null,
  note text not null default '',
  position integer not null default 0,
  primary key (user_id, id),
  constraint activity_day_positive check (day > 0),
  constraint activity_period_valid check (period in ('Morning', 'Afternoon', 'Evening'))
);

create table public.trip_expenses (
  user_id uuid not null references public.trips(user_id) on delete cascade,
  id text not null,
  label text not null,
  category text not null,
  amount numeric(12,2) not null,
  position integer not null default 0,
  primary key (user_id, id),
  constraint expense_amount_nonnegative check (amount >= 0)
);

create table public.saved_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  item_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, item_id),
  constraint saved_item_kind_valid check (kind in ('destination', 'place'))
);

create table public.travel_memories (
  user_id uuid primary key references auth.users(id) on delete cascade,
  journal text not null default '',
  photo_path text,
  updated_at timestamptz not null default now(),
  constraint memory_journal_length check (char_length(journal) <= 1200)
);

alter table public.profiles enable row level security;
alter table public.travel_preferences enable row level security;
alter table public.trips enable row level security;
alter table public.trip_activities enable row level security;
alter table public.trip_expenses enable row level security;
alter table public.saved_items enable row level security;
alter table public.travel_memories enable row level security;

revoke all on public.profiles, public.travel_preferences, public.trips,
  public.trip_activities, public.trip_expenses, public.saved_items,
  public.travel_memories from anon, authenticated;
grant select, insert, update, delete on public.profiles,
  public.travel_preferences, public.trips, public.trip_activities,
  public.trip_expenses, public.saved_items, public.travel_memories
  to authenticated;

create policy "Manage own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Manage own preferences" on public.travel_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Manage own trip" on public.trips
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Manage own activities" on public.trip_activities
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Manage own expenses" on public.trip_expenses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Manage own saved items" on public.saved_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Manage own memories" on public.travel_memories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.replace_trip(
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

  insert into public.trips
    (user_id, destination_id, start_date, end_date, budget, companions, interests)
  values
    (owner_id, p_destination_id, p_start_date, p_end_date, p_budget,
     p_companions, p_interests)
  on conflict (user_id) do update set
    destination_id = excluded.destination_id,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    budget = excluded.budget,
    companions = excluded.companions,
    interests = excluded.interests,
    updated_at = now();

  delete from public.trip_activities where user_id = owner_id;
  delete from public.trip_expenses where user_id = owner_id;

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

revoke all on function public.replace_trip(text, date, date, numeric, text, text[], jsonb) from public;
grant execute on function public.replace_trip(text, date, date, numeric, text, text[], jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('travel-memories', 'travel-memories', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Read own travel photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'travel-memories'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own travel photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'travel-memories'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Update own travel photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'travel-memories'
    and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'travel-memories'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own travel photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'travel-memories'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
