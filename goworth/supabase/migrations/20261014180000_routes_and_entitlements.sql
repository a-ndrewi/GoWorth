-- Additive route fields preserve trips created before multi-city planning.
alter table public.trips add column if not exists day_destinations text[];
alter table public.trips add column if not exists route_stops jsonb;
alter table public.trip_journal_entries add column if not exists day_destinations text[];
alter table public.trip_journal_entries add column if not exists route_stops jsonb;
alter table public.trip_activities add column if not exists place_id text;
alter table public.trip_activities add column if not exists latitude double precision;
alter table public.trip_activities add column if not exists longitude double precision;
alter table public.profiles add column if not exists language text not null default 'en'
  check (language in ('en','ro'));
alter table public.profiles add column if not exists currency text not null default 'EUR'
  check (currency in ('EUR','USD'));
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists avatar_status text not null default 'none'
  check (avatar_status in ('none','pending','approved','rejected'));

create table if not exists public.trip_city_centers (
  destination_id text primary key,
  latitude double precision not null,
  longitude double precision not null
);
revoke all on public.trip_city_centers from anon, authenticated;
grant select on public.trip_city_centers to authenticated;
alter table public.trip_city_centers enable row level security;
drop policy if exists "Read trip city centers" on public.trip_city_centers;
create policy "Read trip city centers" on public.trip_city_centers for select to authenticated using (true);
insert into public.trip_city_centers (destination_id, latitude, longitude) values
  ('positano',40.6281,14.4845),('santorini',36.3932,25.4615),('bali',-8.4095,115.1889),
  ('kyoto',35.0116,135.7681),('iceland',64.9631,-19.0208),('alps',46.8182,8.2275),
  ('paris',48.8566,2.3522),('rome',41.9028,12.4964),('tokyo',35.6762,139.6503),
  ('lisbon',38.7223,-9.1393),('new-york',40.7128,-74.006),('barcelona',41.3874,2.1686),
  ('london',51.5072,-0.1276),('amsterdam',52.3676,4.9041),('istanbul',41.0082,28.9784),
  ('dubai',25.2048,55.2708),('singapore',1.3521,103.8198),('bangkok',13.7563,100.5018),
  ('seoul',37.5665,126.978),('sydney',-33.8688,151.2093),('rio',-22.9068,-43.1729),
  ('cape-town',-33.9249,18.4241),('marrakech',31.6295,-7.9811),('mexico-city',19.4326,-99.1332),
  ('berlin',52.52,13.405),('vienna',48.2082,16.3738),('prague',50.0755,14.4378),
  ('delhi',28.6139,77.209),('hanoi',21.0285,105.8542),('kuala-lumpur',3.139,101.6869),
  ('auckland',-36.8509,174.7645),('toronto',43.6532,-79.3832),('buenos-aires',-34.6037,-58.3816),
  ('lima',-12.0464,-77.0428),('cairo',30.0444,31.2357),('nairobi',-1.2921,36.8219),
  ('dublin',53.3498,-6.2603),('edinburgh',55.9533,-3.1883),('copenhagen',55.6761,12.5683),
  ('stockholm',59.3293,18.0686),('oslo',59.9139,10.7522),('helsinki',60.1699,24.9384),
  ('tallinn',59.437,24.7536),('riga',56.9496,24.1052),('vilnius',54.6872,25.2797),
  ('warsaw',52.2297,21.0122),('budapest',47.4979,19.0402),('athens',37.9838,23.7275),
  ('zagreb',45.815,15.9819),('ljubljana',46.0569,14.5058),('bucharest',44.4268,26.1025),
  ('brasov',45.6427,25.5887),('sibiu',45.7936,24.1213),('sighisoara',46.2197,24.7964),
  ('cluj-napoca',46.7712,23.6236),('oradea',47.0465,21.9189),('suceava',47.6514,26.2556),
  ('iasi',47.1585,27.6014),('sinaia',45.3505,25.5514),('alba-iulia',46.0686,23.5706),
  ('danube-delta',45.17,29.4),('sofia',42.6977,23.3219),('belgrade',44.8125,20.4612),
  ('brussels',50.8503,4.3517)
on conflict (destination_id) do update set latitude=excluded.latitude, longitude=excluded.longitude;

create or replace function public.validate_trip_route() returns trigger language plpgsql
security definer set search_path = '' as $$
declare city text;
begin
  if new.route_stops is not null then
    if pg_catalog.jsonb_typeof(new.route_stops) <> 'array' or
      pg_catalog.jsonb_array_length(new.route_stops) < 1 or
      pg_catalog.jsonb_array_length(new.route_stops) > 10 then
      raise exception 'Choose between 1 and 10 route stops';
    end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(new.route_stops) as stop
      where coalesce(pg_catalog.jsonb_typeof(stop->'id'),'') <> 'string'
        or coalesce(pg_catalog.jsonb_typeof(stop->'name'),'') <> 'string'
        or coalesce(pg_catalog.jsonb_typeof(stop->'country'),'') <> 'string'
        or coalesce(pg_catalog.jsonb_typeof(stop->'latitude'),'') <> 'number'
        or coalesce(pg_catalog.jsonb_typeof(stop->'longitude'),'') <> 'number'
        or abs((stop->>'latitude')::double precision) > 90
        or abs((stop->>'longitude')::double precision) > 180) then
      raise exception 'Invalid route stop';
    end if;
    if (select count(distinct stop->>'id') from pg_catalog.jsonb_array_elements(new.route_stops) as stop)
      <> pg_catalog.jsonb_array_length(new.route_stops) then
      raise exception 'Duplicate route stop';
    end if;
  end if;
  if new.day_destinations is not null then
    if array_length(new.day_destinations, 1) is distinct from (new.end_date - new.start_date + 1)
      or new.day_destinations[1] is distinct from new.destination_id then
      raise exception 'Assign one destination to each trip day, starting with the first city';
    end if;
    foreach city in array new.day_destinations loop
      if not exists (select 1 from public.trip_city_centers where destination_id = city)
        and not exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(new.route_stops,'[]'::jsonb)) as stop
          where stop->>'id' = city) then
        raise exception 'Unknown trip destination';
      end if;
    end loop;
  end if;
  if new.route_stops is not null and not exists (
    select 1 from pg_catalog.jsonb_array_elements(new.route_stops) as stop
    where stop->>'id' = new.destination_id) then
    raise exception 'Starting city is missing from route';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_trip_route on public.trips;
create trigger validate_trip_route before insert or update on public.trips
  for each row execute function public.validate_trip_route();

create or replace function public.validate_trip_activity_place() returns trigger language plpgsql
security definer set search_path = '' as $$
declare trip_row public.trips%rowtype;
declare city_id text;
declare center_row public.trip_city_centers%rowtype;
declare distance_km double precision;
declare max_radius_km double precision;
begin
  select * into trip_row from public.trips where user_id = new.user_id;
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
  city_id := coalesce(trip_row.day_destinations[new.day], trip_row.destination_id);
  select * into center_row from public.trip_city_centers where destination_id = city_id;
  if not found then
    select city_id, (stop->>'latitude')::double precision, (stop->>'longitude')::double precision
      into center_row from pg_catalog.jsonb_array_elements(coalesce(trip_row.route_stops,'[]'::jsonb)) as stop
      where stop->>'id' = city_id;
    if not found then raise exception 'Unknown destination for trip day'; end if;
  end if;
  distance_km := 6371 * acos(least(1, greatest(-1,
    sin(radians(center_row.latitude)) * sin(radians(new.latitude)) +
    cos(radians(center_row.latitude)) * cos(radians(new.latitude)) *
    cos(radians(new.longitude - center_row.longitude)))));
  max_radius_km := case city_id
    when 'iceland' then 350
    when 'alps' then 220
    when 'bali' then 150
    when 'danube-delta' then 160
    when 'new-york' then 85
    else 50
  end;
  if distance_km > max_radius_km then
    raise exception 'Place is outside the city assigned to this day';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_trip_activity_place on public.trip_activities;
create trigger validate_trip_activity_place before insert or update on public.trip_activities
  for each row execute function public.validate_trip_activity_place();

create or replace function public.archive_trip(p_status text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare current_trip public.trips%rowtype;
declare entry_id uuid;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  if p_status not in ('completed', 'replaced') then raise exception 'Invalid archive status'; end if;
  select * into current_trip from public.trips where user_id = owner_id for update;
  if not found then return null; end if;
  insert into public.trip_journal_entries (
    user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,route_stops,
    activities,expenses,saved_place_ids,reflection,status
  ) values (
    owner_id,current_trip.destination_id,current_trip.start_date,current_trip.end_date,
    current_trip.budget,current_trip.companions,current_trip.interests,current_trip.day_destinations,current_trip.route_stops,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'day',day,'period',period,'time',activity_time,'name',name,'note',note,
      'placeId',place_id,'latitude',latitude,'longitude',longitude
    ) order by position) from public.trip_activities where user_id = owner_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'label',label,'category',category,'amount',amount
    ) order by position) from public.trip_expenses where user_id = owner_id),'[]'::jsonb),
    coalesce((select array_agg(item_id) from public.saved_items where user_id = owner_id and kind = 'place'),'{}'::text[]),
    coalesce((select journal from public.travel_memories where user_id = owner_id),''),p_status
  ) returning id into entry_id;
  delete from public.trips where user_id = owner_id;
  update public.travel_memories set journal = '',updated_at = now() where user_id = owner_id;
  return entry_id;
end;
$$;

create function public.replace_trip(
  p_destination_id text,p_start_date date,p_end_date date,p_budget numeric,
  p_companions text,p_interests text[],p_activities jsonb,p_day_destinations text[],p_route_stops jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  perform public.archive_trip('replaced');
  insert into public.trips (user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,route_stops)
  values (owner_id,p_destination_id,p_start_date,p_end_date,p_budget,p_companions,p_interests,p_day_destinations,p_route_stops);
  insert into public.trip_activities (user_id,id,day,period,activity_time,name,note,position,place_id,latitude,longitude)
  select owner_id,item.id,item.day,item.period,item.activity_time,item.name,item.note,item.position,
    item.place_id,item.latitude,item.longitude
  from jsonb_to_recordset(coalesce(p_activities,'[]'::jsonb)) as item(
    id text,day integer,period text,activity_time text,name text,note text,position integer,
    place_id text,latitude double precision,longitude double precision);
end;
$$;
revoke all on function public.replace_trip(text,date,date,numeric,text,text[],jsonb,text[],jsonb) from public;
grant execute on function public.replace_trip(text,date,date,numeric,text,text[],jsonb,text[],jsonb) to authenticated;

create table public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','premium','lifetime')),
  valid_until timestamptz,
  provider text,
  provider_reference text,
  updated_at timestamptz not null default now(),
  constraint premium_has_expiry check (plan <> 'premium' or valid_until is not null)
);
alter table public.user_entitlements enable row level security;
revoke all on public.user_entitlements from anon, authenticated;
grant select on public.user_entitlements to authenticated;
create policy "Read own entitlement" on public.user_entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('trip','place','destination')),
  item_id text,
  created_at timestamptz not null default now()
);
create index usage_events_period_idx on public.usage_events(user_id,kind,created_at);
alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;
grant select on public.usage_events to authenticated;
create policy "Read own usage" on public.usage_events for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.consume_free_allowance() returns trigger language plpgsql
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
  select case when plan = 'lifetime' or (plan = 'premium' and valid_until > now())
    then plan else 'free' end into active_plan
  from public.user_entitlements where user_id = new.user_id;
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
create trigger count_trip_creation before insert on public.trips
  for each row execute function public.consume_free_allowance();
create trigger count_saved_item before insert on public.saved_items
  for each row execute function public.consume_free_allowance();

insert into public.user_entitlements(user_id,plan)
select id,'free' from auth.users on conflict (user_id) do nothing;
create function public.assign_free_plan() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  insert into public.user_entitlements(user_id,plan) values(new.id,'free');
  return new;
end;
$$;
create trigger assign_free_plan after insert on auth.users
  for each row execute function public.assign_free_plan();

-- Profile writes pass through the moderation function; direct client upserts cannot bypass it.
drop policy if exists "Manage own profile" on public.profiles;
revoke insert, update, delete on public.profiles from authenticated;
create policy "Read own profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('profile-avatars','profile-avatars',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false,file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];
create policy "Upload own pending avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'pending');
create policy "Read own approved avatar" on storage.objects for select to authenticated
  using (bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'approved');
