-- Trip companions: the owner of a trip invites other travellers by @username. Once they accept, they see and
-- edit the same trip, and when it ends they get its visas and, if the owner finishes it, a copy in their journal.
-- Free accounts can bring one companion; Premium and Lifetime bring as many as they like.

create table if not exists public.trip_members (
  trip_owner uuid not null references public.trips(user_id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (trip_owner, member_id),
  constraint member_is_not_owner check (trip_owner <> member_id)
);
create index if not exists trip_members_member_idx on public.trip_members(member_id, status);
alter table public.trip_members enable row level security;
-- Every read and write goes through the functions below.
revoke all on public.trip_members from anon, authenticated;

-- A finished shared trip in a companion's journal remembers whose trip it was.
alter table public.trip_journal_entries add column if not exists shared_by uuid references auth.users(id) on delete set null;

create or replace function public.is_trip_companion(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members
    where trip_owner = p_owner and member_id = (select auth.uid()) and status = 'accepted');
$$;
revoke all on function public.is_trip_companion(uuid) from public, anon;
grant execute on function public.is_trip_companion(uuid) to authenticated;

-- Accepted companions read and edit the trip, its itinerary and its expenses. Only the owner creates,
-- replaces, finishes or deletes it.
drop policy if exists "Companions read trip" on public.trips;
create policy "Companions read trip" on public.trips for select to authenticated
  using (public.is_trip_companion(user_id));
drop policy if exists "Companions edit trip" on public.trips;
create policy "Companions edit trip" on public.trips for update to authenticated
  using (public.is_trip_companion(user_id)) with check (public.is_trip_companion(user_id));
drop policy if exists "Companions manage activities" on public.trip_activities;
create policy "Companions manage activities" on public.trip_activities for all to authenticated
  using (public.is_trip_companion(user_id)) with check (public.is_trip_companion(user_id));
drop policy if exists "Companions manage expenses" on public.trip_expenses;
create policy "Companions manage expenses" on public.trip_expenses for all to authenticated
  using (public.is_trip_companion(user_id)) with check (public.is_trip_companion(user_id));

-- A traveller as others see them: only accounts with a username are findable, and only an approved photo is shown.
create or replace function public.traveler_card(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', p_user, 'username', coalesce(p.username, ''), 'name', coalesce(p.display_name, ''),
    'avatarPath', case when p.avatar_status = 'approved' then p.avatar_path end)
  from (select 1) as one left join public.profiles p on p.user_id = p_user;
$$;
revoke all on function public.traveler_card(uuid) from public, anon, authenticated;

create or replace function public.search_travelers(p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
declare term text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.ltrim(pg_catalog.btrim(coalesce(p_query, '')), '@')));
declare pattern text;
begin
  if caller is null then raise exception 'Sign in required'; end if;
  if pg_catalog.char_length(term) < 2 then return '[]'::jsonb; end if;
  pattern := pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(term, '\', '\\'), '%', '\%'), '_', '\_');
  return coalesce((
    select pg_catalog.jsonb_agg(public.traveler_card(found.user_id) order by found.rank, found.username)
    from (
      select p.user_id, p.username,
        case when pg_catalog.lower(p.username) = term then 0
          when pg_catalog.lower(p.username) like pattern || '%' then 1 else 2 end as rank
      from public.profiles p
      where p.username is not null and p.user_id <> caller
        and (pg_catalog.lower(p.username) like pattern || '%'
          or pg_catalog.lower(p.display_name) like '%' || pattern || '%')
      order by rank, p.username
      limit 12
    ) found), '[]'::jsonb);
end;
$$;
revoke all on function public.search_travelers(text) from public, anon;
grant execute on function public.search_travelers(text) to authenticated;

create or replace function public.invite_trip_member(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
declare caller_plan text;
declare invited integer;
begin
  if caller is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.trips where user_id = caller) then raise exception 'Plan a trip before inviting companions'; end if;
  if p_member is null or p_member = caller then raise exception 'Choose another traveller'; end if;
  if not exists (select 1 from public.profiles where user_id = caller and username is not null) then
    raise exception 'Choose a username before inviting companions';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_member and username is not null) then
    raise exception 'Traveller not found';
  end if;
  if exists (select 1 from public.trip_members where trip_owner = caller and member_id = p_member) then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('companions:' || caller::text));
  select count(*) into invited from public.trip_members where trip_owner = caller;
  select plan into caller_plan from public.effective_plan(caller);
  if coalesce(caller_plan, 'free') = 'free' and invited >= 1 then
    raise exception 'Free trips include one companion. Upgrade for unlimited companions';
  end if;
  if invited >= 30 then raise exception 'A trip can have up to 30 companions'; end if;
  insert into public.trip_members (trip_owner, member_id) values (caller, p_member);
end;
$$;
revoke all on function public.invite_trip_member(uuid) from public, anon;
grant execute on function public.invite_trip_member(uuid) to authenticated;

create or replace function public.respond_trip_invite(p_owner uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'Sign in required'; end if;
  if p_accept then
    update public.trip_members set status = 'accepted', responded_at = now()
    where trip_owner = p_owner and member_id = caller;
    if not found then raise exception 'This invitation is no longer available'; end if;
  else
    delete from public.trip_members where trip_owner = p_owner and member_id = caller;
  end if;
end;
$$;
revoke all on function public.respond_trip_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_trip_invite(uuid, boolean) to authenticated;

-- The owner removes anyone; a companion removes only themselves, which is leaving the trip.
create or replace function public.remove_trip_member(p_owner uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'Sign in required'; end if;
  if caller <> p_owner and caller <> p_member then raise exception 'Only the trip owner can remove companions'; end if;
  delete from public.trip_members where trip_owner = p_owner and member_id = p_member;
end;
$$;
revoke all on function public.remove_trip_member(uuid, uuid) from public, anon;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;

-- Trips others invited the caller to, pending or accepted, with enough of each trip to show its card.
create or replace function public.shared_trips() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'Sign in required'; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'owner', public.traveler_card(m.trip_owner), 'status', m.status, 'invitedAt', m.invited_at,
      'trip', pg_catalog.jsonb_build_object(
        'destinationId', t.destination_id, 'start', t.start_date, 'end', t.end_date, 'budget', t.budget,
        'companions', t.companions, 'interests', t.interests, 'dayDestinations', t.day_destinations,
        'dayCities', t.day_cities, 'routeStops', t.route_stops),
      'companions', (select count(*) from public.trip_members other where other.trip_owner = m.trip_owner and other.status = 'accepted'))
      order by m.status desc, t.start_date)
    from public.trip_members m join public.trips t on t.user_id = m.trip_owner
    where m.member_id = caller), '[]'::jsonb);
end;
$$;
revoke all on function public.shared_trips() from public, anon;
grant execute on function public.shared_trips() to authenticated;

-- Everyone on a trip, owner first, for the owner and accepted companions.
create or replace function public.trip_companions(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise exception 'Sign in required'; end if;
  if caller <> p_owner and not public.is_trip_companion(p_owner) then raise exception 'Not on this trip'; end if;
  return pg_catalog.jsonb_build_array(public.traveler_card(p_owner) || '{"status":"owner"}'::jsonb) || coalesce((
    select pg_catalog.jsonb_agg(public.traveler_card(m.member_id) || pg_catalog.jsonb_build_object('status', m.status)
      order by m.status, m.invited_at)
    from public.trip_members m where m.trip_owner = p_owner), '[]'::jsonb);
end;
$$;
revoke all on function public.trip_companions(uuid) from public, anon;
grant execute on function public.trip_companions(uuid) to authenticated;

-- Approved photos of findable travellers are visible to signed-in users, so search results and companions show faces.
-- Profiles are private to their owner, so the check runs as definer.
create or replace function public.is_traveler_avatar(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.avatar_path = p_path and p.avatar_status = 'approved' and p.username is not null);
$$;
revoke all on function public.is_traveler_avatar(text) from public, anon;
grant execute on function public.is_traveler_avatar(text) to authenticated;
drop policy if exists "Read traveler avatars" on storage.objects;
create policy "Read traveler avatars" on storage.objects for select to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[2] = 'approved' and public.is_traveler_avatar(name));

-- Finishing a shared trip gives each companion its own copy in the journal. Runs as definer to write those
-- copies; it only ever archives the caller's own trip.
create or replace function public.archive_trip(p_status text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare current_trip public.trips%rowtype;
declare entry_id uuid;
declare activity_items jsonb;
declare expense_items jsonb;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  if p_status not in ('completed', 'replaced') then raise exception 'Invalid archive status'; end if;
  select * into current_trip from public.trips where user_id = owner_id for update;
  if not found then return null; end if;
  activity_items := coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'day',day,'period',period,'time',activity_time,'name',name,'note',note,
      'placeId',place_id,'latitude',latitude,'longitude',longitude
    ) order by position) from public.trip_activities where user_id = owner_id),'[]'::jsonb);
  expense_items := coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'label',label,'category',category,'amount',amount
    ) order by position) from public.trip_expenses where user_id = owner_id),'[]'::jsonb);
  insert into public.trip_journal_entries (
    user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,
    activities,expenses,saved_place_ids,reflection,status,trip_created_at
  ) values (
    owner_id,current_trip.destination_id,current_trip.start_date,current_trip.end_date,
    current_trip.budget,current_trip.companions,current_trip.interests,current_trip.day_destinations,current_trip.day_cities,current_trip.route_stops,
    activity_items,expense_items,
    coalesce((select array_agg(item_id) from public.saved_items where user_id = owner_id and kind = 'place'),'{}'::text[]),
    coalesce((select journal from public.travel_memories where user_id = owner_id),''),p_status,current_trip.created_at
  ) returning id into entry_id;
  if p_status = 'completed' then
    insert into public.trip_journal_entries (
      user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,
      activities,expenses,saved_place_ids,reflection,status,trip_created_at,shared_by
    )
    select m.member_id,current_trip.destination_id,current_trip.start_date,current_trip.end_date,
      current_trip.budget,current_trip.companions,current_trip.interests,current_trip.day_destinations,current_trip.day_cities,current_trip.route_stops,
      activity_items,expense_items,'{}'::text[],'','completed',current_trip.created_at,owner_id
    from public.trip_members m where m.trip_owner = owner_id and m.status = 'accepted';
  end if;
  delete from public.trips where user_id = owner_id;
  update public.travel_memories set journal = '',updated_at = now() where user_id = owner_id;
  return entry_id;
end;
$$;
revoke all on function public.archive_trip(text) from public, anon;
grant execute on function public.archive_trip(text) to authenticated;

-- Companions earn the visas of a shared trip that has ended, the same way the owner does.
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
    from public.trips t join public.trip_members m on m.trip_owner = t.user_id
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
