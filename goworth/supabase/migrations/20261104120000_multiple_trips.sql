-- Multiple trips per account. A trip gets its own id instead of being keyed by its owner, so Premium can plan
-- several trips side by side. Free keeps one active trip: planning a new one moves the current one to the journal,
-- as before. Activities, expenses and companions now belong to a trip, and each trip keeps its own note.

alter table public.trips add column if not exists id uuid not null default gen_random_uuid();
alter table public.trips add column if not exists note text not null default '';
alter table public.trips drop constraint if exists trip_note_length;
alter table public.trips add constraint trip_note_length check (char_length(note) <= 1200);
-- The note used to live on the account; it belonged to the one current trip.
update public.trips t set note = m.journal from public.travel_memories m where m.user_id = t.user_id;
update public.travel_memories set journal = '', updated_at = now() where journal <> '';

alter table public.trip_activities add column if not exists trip_id uuid;
alter table public.trip_expenses add column if not exists trip_id uuid;
alter table public.trip_members add column if not exists trip_id uuid;
update public.trip_activities a set trip_id = t.id from public.trips t where t.user_id = a.user_id and a.trip_id is null;
update public.trip_expenses e set trip_id = t.id from public.trips t where t.user_id = e.user_id and e.trip_id is null;
update public.trip_members m set trip_id = t.id from public.trips t where t.user_id = m.trip_owner and m.trip_id is null;

-- Policies and functions keyed by the owner go first; they are rebuilt on the trip id below.
drop policy if exists "Companions read trip" on public.trips;
drop policy if exists "Companions edit trip" on public.trips;
drop policy if exists "Companions manage activities" on public.trip_activities;
drop policy if exists "Companions manage expenses" on public.trip_expenses;
drop function if exists public.is_trip_companion(uuid);
drop function if exists public.invite_trip_member(uuid);
drop function if exists public.respond_trip_invite(uuid, boolean);
drop function if exists public.remove_trip_member(uuid, uuid);
drop function if exists public.trip_companions(uuid);
drop function if exists public.archive_trip(text);
drop function if exists public.replace_trip(text, date, date, numeric, text, text[], jsonb);
drop function if exists public.replace_trip(text, date, date, numeric, text, text[], jsonb, text[], jsonb);
drop function if exists public.replace_trip(text, date, date, numeric, text, text[], jsonb, text[], jsonb, jsonb);

alter table public.trip_activities drop constraint if exists trip_activities_user_id_fkey;
alter table public.trip_activities drop constraint if exists trip_activities_pkey;
alter table public.trip_expenses drop constraint if exists trip_expenses_user_id_fkey;
alter table public.trip_expenses drop constraint if exists trip_expenses_pkey;
alter table public.trip_members drop constraint if exists trip_members_trip_owner_fkey;
alter table public.trip_members drop constraint if exists trip_members_pkey;
alter table public.trips drop constraint if exists trips_pkey;

alter table public.trips add primary key (id);
create index if not exists trips_owner_idx on public.trips (user_id, start_date);

alter table public.trip_activities alter column trip_id set not null,
  add constraint trip_activities_trip_id_fkey foreign key (trip_id) references public.trips(id) on delete cascade,
  add constraint trip_activities_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  add primary key (trip_id, id);
alter table public.trip_expenses alter column trip_id set not null,
  add constraint trip_expenses_trip_id_fkey foreign key (trip_id) references public.trips(id) on delete cascade,
  add constraint trip_expenses_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  add primary key (trip_id, id);
alter table public.trip_members alter column trip_id set not null,
  add constraint trip_members_trip_id_fkey foreign key (trip_id) references public.trips(id) on delete cascade,
  add constraint trip_members_trip_owner_fkey foreign key (trip_owner) references auth.users(id) on delete cascade,
  add primary key (trip_id, member_id);
create index if not exists trip_activities_owner_idx on public.trip_activities (user_id);
create index if not exists trip_expenses_owner_idx on public.trip_expenses (user_id);

-- An activity or expense always carries the owner of its trip, whoever on the trip writes it, so the owner's
-- policies keep working and nobody can file a row under another account.
create or replace function public.set_trip_row_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select t.user_id into new.user_id from public.trips t where t.id = new.trip_id;
  if not found then raise exception 'Trip not found'; end if;
  return new;
end;
$$;
revoke all on function public.set_trip_row_owner() from public, anon, authenticated;
drop trigger if exists set_trip_row_owner on public.trip_activities;
create trigger set_trip_row_owner before insert or update on public.trip_activities
  for each row execute function public.set_trip_row_owner();
drop trigger if exists set_trip_row_owner on public.trip_expenses;
create trigger set_trip_row_owner before insert or update on public.trip_expenses
  for each row execute function public.set_trip_row_owner();

-- Companions may edit a trip but never move it to another account.
create or replace function public.guard_trip_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'A trip cannot change owner';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_trip_identity on public.trips;
create trigger guard_trip_identity before update on public.trips
  for each row execute function public.guard_trip_identity();

create or replace function public.is_trip_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members
    where trip_id = p_trip and member_id = (select auth.uid()) and status = 'accepted');
$$;
revoke all on function public.is_trip_member(uuid) from public, anon;
grant execute on function public.is_trip_member(uuid) to authenticated;

create policy "Companions read trip" on public.trips for select to authenticated
  using (public.is_trip_member(id));
create policy "Companions edit trip" on public.trips for update to authenticated
  using (public.is_trip_member(id)) with check (public.is_trip_member(id));
create policy "Companions manage activities" on public.trip_activities for all to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "Companions manage expenses" on public.trip_expenses for all to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create or replace function public.validate_trip_activity_place() returns trigger language plpgsql
security definer set search_path = '' as $$
declare trip_row public.trips%rowtype;
declare city_id text;
declare center_row public.trip_city_centers%rowtype;
declare distance_km double precision;
declare max_radius_km double precision;
begin
  select * into trip_row from public.trips where id = new.trip_id;
  if not found or new.day < 1 or new.day > (trip_row.end_date - trip_row.start_date + 1) then
    raise exception 'Activity day is outside the trip';
  end if;
  if new.place_id is null then
    if new.latitude is not null or new.longitude is not null then raise exception 'Place ID required for coordinates'; end if;
    return new;
  end if;
  if new.latitude is null or new.longitude is null or abs(new.latitude) > 90 or abs(new.longitude) > 180 then
    raise exception 'Valid place coordinates required';
  end if;
  for city_id in select value from pg_catalog.jsonb_array_elements_text(
    coalesce(trip_row.day_cities->(new.day - 1),
      pg_catalog.jsonb_build_array(coalesce(trip_row.day_destinations[new.day], trip_row.destination_id)))) loop
    select * into center_row from public.trip_city_centers where destination_id = city_id;
    if not found then
      select city_id, (stop->>'latitude')::double precision, (stop->>'longitude')::double precision
        into center_row from pg_catalog.jsonb_array_elements(coalesce(trip_row.route_stops,'[]'::jsonb)) as stop
        where stop->>'id' = city_id;
      if not found then continue; end if;
    end if;
    distance_km := 6371 * acos(least(1, greatest(-1,
      sin(radians(center_row.latitude)) * sin(radians(new.latitude)) +
      cos(radians(center_row.latitude)) * cos(radians(new.latitude)) *
      cos(radians(new.longitude - center_row.longitude)))));
    max_radius_km := case city_id
      when 'iceland' then 350 when 'alps' then 220 when 'bali' then 150
      when 'danube-delta' then 160 when 'new-york' then 85 else 50 end;
    if distance_km <= max_radius_km then return new; end if;
  end loop;
  raise exception 'Place is outside the cities planned for this day';
end;
$$;

-- Moves one of the caller's trips to their journal; a finished shared trip also lands in each companion's journal.
create or replace function public.archive_trip(p_trip uuid, p_status text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare current_trip public.trips%rowtype;
declare entry_id uuid;
declare activity_items jsonb;
declare expense_items jsonb;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  if p_status not in ('completed', 'replaced') then raise exception 'Invalid archive status'; end if;
  select * into current_trip from public.trips where id = p_trip and user_id = owner_id for update;
  if not found then return null; end if;
  activity_items := coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'day',day,'period',period,'time',activity_time,'name',name,'note',note,
      'placeId',place_id,'latitude',latitude,'longitude',longitude
    ) order by position) from public.trip_activities where trip_id = p_trip),'[]'::jsonb);
  expense_items := coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'label',label,'category',category,'amount',amount
    ) order by position) from public.trip_expenses where trip_id = p_trip),'[]'::jsonb);
  insert into public.trip_journal_entries (
    user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,
    activities,expenses,saved_place_ids,reflection,status,trip_created_at
  ) values (
    owner_id,current_trip.destination_id,current_trip.start_date,current_trip.end_date,
    current_trip.budget,current_trip.companions,current_trip.interests,current_trip.day_destinations,current_trip.day_cities,current_trip.route_stops,
    activity_items,expense_items,
    coalesce((select array_agg(item_id) from public.saved_items where user_id = owner_id and kind = 'place'),'{}'::text[]),
    current_trip.note,p_status,current_trip.created_at
  ) returning id into entry_id;
  if p_status = 'completed' then
    insert into public.trip_journal_entries (
      user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,
      activities,expenses,saved_place_ids,reflection,status,trip_created_at,shared_by
    )
    select m.member_id,current_trip.destination_id,current_trip.start_date,current_trip.end_date,
      current_trip.budget,current_trip.companions,current_trip.interests,current_trip.day_destinations,current_trip.day_cities,current_trip.route_stops,
      activity_items,expense_items,'{}'::text[],'','completed',current_trip.created_at,owner_id
    from public.trip_members m where m.trip_id = p_trip and m.status = 'accepted';
  end if;
  delete from public.trips where id = p_trip;
  return entry_id;
end;
$$;
revoke all on function public.archive_trip(uuid, text) from public, anon;
grant execute on function public.archive_trip(uuid, text) to authenticated;

-- Plans a new trip and returns its id. Premium and Lifetime keep up to 20 trips side by side. Free keeps one:
-- the current trip moves to the journal, and an account left with several after Premium ends finishes or
-- deletes some first. The monthly allowance on new trips still applies through the insert trigger.
create or replace function public.create_trip(
  p_destination_id text, p_start_date date, p_end_date date, p_budget numeric, p_companions text,
  p_interests text[], p_day_destinations text[], p_day_cities jsonb, p_route_stops jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare owner_plan text;
declare active integer;
declare new_id uuid;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('trips:' || owner_id::text));
  select plan into owner_plan from public.effective_plan(owner_id);
  select count(*) into active from public.trips where user_id = owner_id;
  if coalesce(owner_plan, 'free') = 'free' then
    if active > 1 then
      raise exception 'Free plan includes one active trip. Finish or delete a trip, or upgrade for unlimited trips';
    end if;
    if active = 1 then
      perform public.archive_trip((select id from public.trips where user_id = owner_id), 'replaced');
    end if;
  elsif active >= 20 then
    raise exception 'You can plan up to 20 trips at a time. Finish or delete one first';
  end if;
  insert into public.trips (user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops)
  values (owner_id,p_destination_id,p_start_date,p_end_date,p_budget,p_companions,p_interests,p_day_destinations,p_day_cities,p_route_stops)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.create_trip(text,date,date,numeric,text,text[],text[],jsonb,jsonb) from public, anon;
grant execute on function public.create_trip(text,date,date,numeric,text,text[],text[],jsonb,jsonb) to authenticated;

create or replace function public.invite_trip_member(p_trip uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
declare caller_plan text;
declare invited integer;
begin
  if caller is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.trips where id = p_trip and user_id = caller) then
    raise exception 'Only the trip owner can invite companions';
  end if;
  if p_member is null or p_member = caller then raise exception 'Choose another traveller'; end if;
  if not exists (select 1 from public.profiles where user_id = caller and username is not null) then
    raise exception 'Choose a username before inviting companions';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_member and username is not null) then
    raise exception 'Traveller not found';
  end if;
  if exists (select 1 from public.trip_members where trip_id = p_trip and member_id = p_member) then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('companions:' || p_trip::text));
  select count(*) into invited from public.trip_members where trip_id = p_trip;
  select plan into caller_plan from public.effective_plan(caller);
  if coalesce(caller_plan, 'free') = 'free' and invited >= 1 then
    raise exception 'Free trips include one companion. Upgrade for unlimited companions';
  end if;
  if invited >= 30 then raise exception 'A trip can have up to 30 companions'; end if;
  insert into public.trip_members (trip_id, trip_owner, member_id) values (p_trip, caller, p_member);
end;
$$;
revoke all on function public.invite_trip_member(uuid, uuid) from public, anon;
grant execute on function public.invite_trip_member(uuid, uuid) to authenticated;

create function public.respond_trip_invite(p_trip uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'Sign in required'; end if;
  if p_accept then
    update public.trip_members set status = 'accepted', responded_at = now()
    where trip_id = p_trip and member_id = caller;
    if not found then raise exception 'This invitation is no longer available'; end if;
  else
    delete from public.trip_members where trip_id = p_trip and member_id = caller;
  end if;
end;
$$;
revoke all on function public.respond_trip_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_trip_invite(uuid, boolean) to authenticated;

-- The owner removes anyone; a companion removes only themselves, which is leaving the trip.
create function public.remove_trip_member(p_trip uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'Sign in required'; end if;
  if caller <> p_member and not exists (select 1 from public.trips where id = p_trip and user_id = caller) then
    raise exception 'Only the trip owner can remove companions';
  end if;
  delete from public.trip_members where trip_id = p_trip and member_id = p_member;
end;
$$;
revoke all on function public.remove_trip_member(uuid, uuid) from public, anon;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;

create or replace function public.shared_trips() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'Sign in required'; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'tripId', t.id, 'owner', public.traveler_card(m.trip_owner), 'status', m.status, 'invitedAt', m.invited_at,
      'trip', pg_catalog.jsonb_build_object(
        'id', t.id, 'destinationId', t.destination_id, 'start', t.start_date, 'end', t.end_date, 'budget', t.budget,
        'companions', t.companions, 'interests', t.interests, 'dayDestinations', t.day_destinations,
        'dayCities', t.day_cities, 'routeStops', t.route_stops),
      'companions', (select count(*) from public.trip_members other where other.trip_id = m.trip_id and other.status = 'accepted'))
      order by m.status desc, t.start_date)
    from public.trip_members m join public.trips t on t.id = m.trip_id
    where m.member_id = caller), '[]'::jsonb);
end;
$$;
revoke all on function public.shared_trips() from public, anon;
grant execute on function public.shared_trips() to authenticated;

create function public.trip_companions(p_trip uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
declare owner_id uuid;
begin
  if caller is null then raise exception 'Sign in required'; end if;
  select user_id into owner_id from public.trips where id = p_trip;
  if owner_id is null or (caller <> owner_id and not public.is_trip_member(p_trip)) then raise exception 'Not on this trip'; end if;
  return pg_catalog.jsonb_build_array(public.traveler_card(owner_id) || '{"status":"owner"}'::jsonb) || coalesce((
    select pg_catalog.jsonb_agg(public.traveler_card(m.member_id) || pg_catalog.jsonb_build_object('status', m.status)
      order by m.status, m.invited_at)
    from public.trip_members m where m.trip_id = p_trip), '[]'::jsonb);
end;
$$;
revoke all on function public.trip_companions(uuid) from public, anon;
grant execute on function public.trip_companions(uuid) to authenticated;

create or replace function public.claim_visas() returns integer
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare trip record;
declare place record;
declare changed integer := 0;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('visas:' || owner_id::text));
  for trip in
    select t.destination_id, t.start_date, t.end_date, t.day_destinations, t.route_stops
    from public.trips t
    where t.user_id = owner_id and t.end_date < current_date and t.created_at::date <= t.end_date
    union all
    select t.destination_id, t.start_date, t.end_date, t.day_destinations, t.route_stops
    from public.trips t join public.trip_members m on m.trip_id = t.id
    where m.member_id = owner_id and m.status = 'accepted' and t.end_date < current_date and t.created_at::date <= t.end_date
    union all
    select j.destination_id, j.start_date, j.end_date, j.day_destinations, j.route_stops
    from public.trip_journal_entries j
    where j.user_id = owner_id and j.end_date < current_date and j.archived_at::date > j.end_date
      and (j.trip_created_at is null or j.trip_created_at::date <= j.end_date)
  loop
    insert into public.visa_awards (user_id, trip_key)
    values (owner_id, trip.destination_id || '|' || trip.start_date || '|' || trip.end_date)
    on conflict do nothing;
    if not found then continue; end if;
    for place in
      select tc.country_code, pg_catalog.array_agg(distinct tc.city) as cities
      from public.trip_countries(trip.destination_id, trip.day_destinations, trip.route_stops) tc
      group by tc.country_code
    loop
      insert into public.visas as v (user_id, country_code, cities, first_entry, last_entry, stamps)
      values (owner_id, place.country_code, place.cities, trip.start_date, trip.end_date,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('date', trip.start_date)))
      on conflict (user_id, country_code) do update set
        entries = v.entries + 1,
        cities = (select pg_catalog.array_agg(distinct name) from pg_catalog.unnest(v.cities || excluded.cities) as name),
        first_entry = least(v.first_entry, excluded.first_entry),
        last_entry = greatest(v.last_entry, excluded.last_entry),
        stamps = v.stamps || excluded.stamps,
        seen = false;
      changed := changed + 1;
    end loop;
  end loop;
  return changed;
end;
$$;
revoke all on function public.claim_visas() from public, anon;
grant execute on function public.claim_visas() to authenticated;
