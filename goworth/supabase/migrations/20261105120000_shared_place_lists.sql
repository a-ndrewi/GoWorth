-- Finished lists of places and venues, shared by every traveller. A city's sights, restaurants and cafés are the same
-- for everyone, so the first device to load an area saves the list here and the next ones read it in one request
-- instead of asking Photon, Overpass, Wikipedia and Wikimedia again (Photon turns away devices that ask too often).
-- The lists hold only public OpenStreetMap and Wikipedia data and never who saved them.

create table if not exists public.place_lists (
  key text primary key check (char_length(key) <= 160),
  places jsonb not null check (jsonb_typeof(places) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.place_lists enable row level security;
revoke all on public.place_lists from anon, authenticated;
grant select on public.place_lists to anon, authenticated;
drop policy if exists "Anyone reads shared place lists" on public.place_lists;
create policy "Anyone reads shared place lists" on public.place_lists for select to anon, authenticated using (true);

-- Lists are written only through this function, which checks every place: an OpenStreetMap or Wikipedia id and link,
-- a name, and coordinates near the area the key names. A list less than a day old is kept, so one account cannot keep
-- replacing a city's places.
create or replace function public.save_place_list(list_key text, list jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  key_parts text[];
  center_latitude double precision;
  center_longitude double precision;
  place jsonb;
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  -- places:<lat>|<lon>|<radius km>|<outline id> or venues:<lat>|<lon>|<radius km>
  key_parts := regexp_match(list_key, '^(?:places|venues):(-?\d{1,2}\.\d{3})\|(-?\d{1,3}\.\d{3})\|\d{1,2}(?:\.\d{1,17})?(?:\|[A-Za-z0-9:/_-]{0,40})?$');
  if key_parts is null then
    raise exception 'Invalid place list key';
  end if;
  center_latitude := key_parts[1]::double precision;
  center_longitude := key_parts[2]::double precision;
  if jsonb_typeof(list) <> 'array' or jsonb_array_length(list) not between 1 and 400 or pg_column_size(list) > 800000 then
    raise exception 'Invalid place list';
  end if;
  for place in select value from jsonb_array_elements(list) loop
    if jsonb_typeof(place) <> 'object'
      or jsonb_typeof(place -> 'id') is distinct from 'string'
      or place ->> 'id' !~ '^(osm:(node|way|relation):\d{1,12}|wiki:([a-z]{2,3}:)?\d{1,12})$'
      or jsonb_typeof(place -> 'name') is distinct from 'string'
      or char_length(place ->> 'name') not between 1 and 200
      or jsonb_typeof(place -> 'category') is distinct from 'string'
      or char_length(place ->> 'category') > 60
      or coalesce(place ->> 'sourceUrl', '') !~ '^https://(www\.openstreetmap\.org/(node|way|relation)/\d{1,12}|[a-z]{2,3}\.wikipedia\.org/\?curid=\d{1,12})$'
      or jsonb_typeof(place -> 'latitude') is distinct from 'number'
      or jsonb_typeof(place -> 'longitude') is distinct from 'number'
      -- The widest search is 25 km, so anything a degree away does not belong to this area.
      or abs((place ->> 'latitude')::double precision - center_latitude) > 1
      or abs((place ->> 'longitude')::double precision - center_longitude) > 2
    then
      raise exception 'Invalid place in list';
    end if;
  end loop;
  insert into public.place_lists as saved (key, places, updated_at)
  values (list_key, list, now())
  on conflict (key) do update set places = excluded.places, updated_at = now()
    where saved.updated_at < now() - interval '1 day';
  return found;
end;
$$;

revoke all on function public.save_place_list(text, jsonb) from public, anon;
grant execute on function public.save_place_list(text, jsonb) to authenticated;
