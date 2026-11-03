-- The visa passport: a country's visa is issued once a trip there has ended, without the traveller having to
-- finish it. A trip counts only if it was still planned when it ended, so a trip made or finished early, or
-- created with dates already past, earns nothing. Free accounts collect visas too; the app shows them locked.

-- When the trip was planned, so one created after its own end date can be told apart.
alter table public.trips add column if not exists created_at timestamptz not null default now();
alter table public.trip_journal_entries add column if not exists trip_created_at timestamptz;

-- Catalog destinations by country, matching src/data/catalog.ts; route stops carry their own country code.
create table if not exists public.destination_countries (
  destination_id text primary key,
  name text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$')
);
revoke all on public.destination_countries from anon, authenticated;
alter table public.destination_countries enable row level security;
insert into public.destination_countries (destination_id, name, country_code) values
  ('positano','Positano','IT'),('santorini','Santorini','GR'),('bali','Bali','ID'),('kyoto','Kyoto','JP'),
  ('iceland','Iceland','IS'),('alps','Swiss Alps','CH'),('paris','Paris','FR'),('rome','Rome','IT'),
  ('tokyo','Tokyo','JP'),('lisbon','Lisbon','PT'),('new-york','New York City','US'),('barcelona','Barcelona','ES'),
  ('london','London','GB'),('amsterdam','Amsterdam','NL'),('istanbul','Istanbul','TR'),('dubai','Dubai','AE'),
  ('singapore','Singapore','SG'),('bangkok','Bangkok','TH'),('seoul','Seoul','KR'),('sydney','Sydney','AU'),
  ('rio','Rio de Janeiro','BR'),('cape-town','Cape Town','ZA'),('marrakech','Marrakech','MA'),('mexico-city','Mexico City','MX'),
  ('berlin','Berlin','DE'),('vienna','Vienna','AT'),('prague','Prague','CZ'),('delhi','Delhi','IN'),
  ('hanoi','Hanoi','VN'),('kuala-lumpur','Kuala Lumpur','MY'),('auckland','Auckland','NZ'),('toronto','Toronto','CA'),
  ('buenos-aires','Buenos Aires','AR'),('lima','Lima','PE'),('cairo','Cairo','EG'),('nairobi','Nairobi','KE'),
  ('dublin','Dublin','IE'),('edinburgh','Edinburgh','GB'),('copenhagen','Copenhagen','DK'),('stockholm','Stockholm','SE'),
  ('oslo','Oslo','NO'),('helsinki','Helsinki','FI'),('tallinn','Tallinn','EE'),('riga','Riga','LV'),
  ('vilnius','Vilnius','LT'),('warsaw','Warsaw','PL'),('budapest','Budapest','HU'),('athens','Athens','GR'),
  ('zagreb','Zagreb','HR'),('ljubljana','Ljubljana','SI'),('bucharest','Bucharest','RO'),('brasov','Brașov','RO'),
  ('sibiu','Sibiu','RO'),('sighisoara','Sighișoara','RO'),('cluj-napoca','Cluj-Napoca','RO'),('oradea','Oradea','RO'),
  ('suceava','Suceava','RO'),('iasi','Iași','RO'),('sinaia','Sinaia','RO'),('alba-iulia','Alba Iulia','RO'),
  ('danube-delta','Danube Delta','RO'),('sofia','Sofia','BG'),('belgrade','Belgrade','RS'),('brussels','Brussels','BE')
on conflict (destination_id) do update set name = excluded.name, country_code = excluded.country_code;

create table if not exists public.visas (
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  entries integer not null default 1 check (entries > 0),
  cities text[] not null default '{}',
  first_entry date not null,
  last_entry date not null,
  -- One entry stamp per trip, pressed on the visa page: [{"date": "2026-09-14"}].
  stamps jsonb not null default '[]'::jsonb,
  issued_at timestamptz not null default now(),
  -- Unseen visas, new or with a new entry, are what the award animation shows on the next launch.
  seen boolean not null default false,
  primary key (user_id, country_code)
);
alter table public.visas enable row level security;
revoke all on public.visas from anon, authenticated;
grant select on public.visas to authenticated;
drop policy if exists "Read own visas" on public.visas;
create policy "Read own visas" on public.visas for select to authenticated using ((select auth.uid()) = user_id);

-- Trips already turned into visas, keyed by destination and dates so a trip counts once whether it is still
-- the current trip or has moved to the journal.
create table if not exists public.visa_awards (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_key text not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, trip_key)
);
alter table public.visa_awards enable row level security;
revoke all on public.visa_awards from anon, authenticated;

-- The countries a trip passes through, with the city names seen in each.
create or replace function public.trip_countries(p_destination text, p_days text[], p_stops jsonb)
returns table (country_code text, city text) language sql stable security definer set search_path = '' as $$
  with stops as (
    select stop->>'id' as id, stop->>'name' as name, upper(stop->>'countryCode') as code
    from pg_catalog.jsonb_array_elements(coalesce(p_stops, '[]'::jsonb)) as stop
  ), ids as (
    select distinct id from pg_catalog.unnest(array[p_destination] || coalesce(p_days, '{}')) as id
  )
  select distinct code, name from (
    select coalesce(stops.code, dc.country_code) as code, coalesce(stops.name, dc.name) as name
    from ids left join stops on stops.id = ids.id left join public.destination_countries dc on dc.destination_id = ids.id
    union all
    select code, name from stops
  ) found
  where code ~ '^[A-Z]{2}$';
$$;
revoke all on function public.trip_countries(text, text[], jsonb) from public, anon, authenticated;

-- Issues the visas earned by trips that have ended. Safe to call on every launch; returns how many visas
-- were issued or gained an entry.
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

create or replace function public.mark_visas_seen() returns void
language sql security definer set search_path = '' as $$
  update public.visas set seen = true where user_id = (select auth.uid()) and not seen;
$$;
revoke all on function public.mark_visas_seen() from public, anon;
grant execute on function public.mark_visas_seen() to authenticated;

-- Archiving keeps when the trip was planned, so a finished trip is judged the same way as a current one.
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
    activities,expenses,saved_place_ids,reflection,status,trip_created_at
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
    coalesce((select journal from public.travel_memories where user_id = owner_id),''),p_status,current_trip.created_at
  ) returning id into entry_id;
  delete from public.trips where user_id = owner_id;
  update public.travel_memories set journal = '',updated_at = now() where user_id = owner_id;
  return entry_id;
end;
$$;
