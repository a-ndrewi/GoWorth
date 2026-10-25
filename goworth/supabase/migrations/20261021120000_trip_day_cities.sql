alter table public.trips add column if not exists day_cities jsonb;
alter table public.trip_journal_entries add column if not exists day_cities jsonb;

create or replace function public.validate_trip_day_cities() returns trigger
language plpgsql security definer set search_path = '' as $$
declare day_item jsonb;
declare city_id text;
begin
  if new.day_cities is null then return new; end if;
  if pg_catalog.jsonb_typeof(new.day_cities) <> 'array' or
    pg_catalog.jsonb_array_length(new.day_cities) <> (new.end_date - new.start_date + 1) then
    raise exception 'Assign cities to every trip day';
  end if;
  for day_item in select value from pg_catalog.jsonb_array_elements(new.day_cities) loop
    if pg_catalog.jsonb_typeof(day_item) <> 'array' or pg_catalog.jsonb_array_length(day_item) < 1 then
      raise exception 'Each trip day needs a city';
    end if;
    if (select count(distinct value) from pg_catalog.jsonb_array_elements_text(day_item))
      <> pg_catalog.jsonb_array_length(day_item) then
      raise exception 'A city cannot appear twice on the same day';
    end if;
    for city_id in select value from pg_catalog.jsonb_array_elements_text(day_item) loop
      if not exists (select 1 from public.trip_city_centers where destination_id = city_id)
        and not exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(new.route_stops, '[]'::jsonb)) as stop
          where stop->>'id' = city_id) then
        raise exception 'Unknown city in trip day';
      end if;
    end loop;
  end loop;
  if new.day_cities->0->>0 is distinct from new.destination_id or
    (new.day_destinations is not null and exists (
      select 1 from pg_catalog.generate_series(1, pg_catalog.jsonb_array_length(new.day_cities)) as day_number
      where new.day_cities->(day_number - 1)->>0 is distinct from new.day_destinations[day_number])) then
    raise exception 'Daily first city must match the trip route';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_trip_day_cities on public.trips;
create trigger validate_trip_day_cities before insert or update on public.trips
  for each row execute function public.validate_trip_day_cities();

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
    user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,
    activities,expenses,saved_place_ids,reflection,status
  ) values (
    owner_id,current_trip.destination_id,current_trip.start_date,current_trip.end_date,
    current_trip.budget,current_trip.companions,current_trip.interests,current_trip.day_destinations,current_trip.day_cities,current_trip.route_stops,
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
  p_companions text,p_interests text[],p_activities jsonb,p_day_destinations text[],
  p_day_cities jsonb,p_route_stops jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  perform public.archive_trip('replaced');
  insert into public.trips (user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops)
  values (owner_id,p_destination_id,p_start_date,p_end_date,p_budget,p_companions,p_interests,p_day_destinations,p_day_cities,p_route_stops);
  insert into public.trip_activities (user_id,id,day,period,activity_time,name,note,position,place_id,latitude,longitude)
  select owner_id,item.id,item.day,item.period,item.activity_time,item.name,item.note,item.position,
    item.place_id,item.latitude,item.longitude
  from jsonb_to_recordset(coalesce(p_activities,'[]'::jsonb)) as item(
    id text,day integer,period text,activity_time text,name text,note text,position integer,
    place_id text,latitude double precision,longitude double precision);
end;
$$;
revoke all on function public.replace_trip(text,date,date,numeric,text,text[],jsonb,text[],jsonb,jsonb) from public;
grant execute on function public.replace_trip(text,date,date,numeric,text,text[],jsonb,text[],jsonb,jsonb) to authenticated;
