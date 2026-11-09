-- Test data only: gives andreitest@test.com eight finished trips in 2026, so the yearly travel recap (Wrapped) has
-- something to show. Run it in the Supabase dashboard, SQL Editor, on the project the app uses. Run
-- seed-test-visas.sql first if you also want the passport and 30 days of Premium; this adds the two visas it lacks.
-- Safe to run again: it replaces the same rows. The cleanup at the bottom removes everything it adds.

do $$
declare
  tester uuid := (select id from auth.users where lower(email) = 'andreitest@test.com');
begin
  if tester is null then raise exception 'No account with the email andreitest@test.com'; end if;

  -- Seeded rows get an id made from the account, city and start date, so a rerun or the cleanup finds only them.
  delete from public.trip_journal_entries
  where user_id = tester and id = md5(user_id::text || destination_id || start_date::text)::uuid;

  insert into public.trip_journal_entries
    (id, user_id, destination_id, start_date, end_date, budget, companions, interests, day_destinations, route_stops,
     activities, expenses, reflection, status, archived_at)
  select md5(tester::text || destination_id || start_date::text)::uuid, tester, destination_id, start_date, end_date,
    budget, companions, interests, day_destinations, route_stops, activities, expenses, reflection, 'completed', end_date + interval '1 day'
  from (values
    ('vienna', date '2026-02-13', date '2026-02-16', 900, 'Partner', array['Culture','Food'],
      array['vienna','vienna','prague','prague'],
      '[{"id":"vienna","name":"Vienna","country":"Austria","countryCode":"AT","latitude":48.2082,"longitude":16.3738},
        {"id":"prague","name":"Prague","country":"Czechia","countryCode":"CZ","latitude":50.0755,"longitude":14.4378}]'::jsonb,
      '[{"id":"a1","day":1,"period":"Morning","time":"10:00","name":"Schönbrunn Palace","note":""},
        {"id":"a2","day":2,"period":"Afternoon","time":"15:00","name":"Café Central","note":""},
        {"id":"a3","day":3,"period":"Morning","time":"09:30","name":"Charles Bridge","note":""},
        {"id":"a4","day":4,"period":"Afternoon","time":"14:00","name":"Prague Castle","note":""}]'::jsonb,
      '[{"id":"e1","label":"Hotel","category":"Accommodation","amount":420},{"id":"e2","label":"Train to Prague","category":"Transportation","amount":60},
        {"id":"e3","label":"Dinners","category":"Food & Drinks","amount":180}]'::jsonb,
      'Snow in Vienna, sun in Prague.'),
    ('istanbul', date '2026-03-06', date '2026-03-11', 1100, 'Friends', array['Culture','Food'],
      array['istanbul','istanbul','istanbul','istanbul','istanbul','istanbul'],
      '[{"id":"istanbul","name":"Istanbul","country":"Turkey","countryCode":"TR","latitude":41.0082,"longitude":28.9784}]'::jsonb,
      '[{"id":"a1","day":1,"period":"Morning","time":"09:00","name":"Hagia Sophia","note":""},
        {"id":"a2","day":2,"period":"Afternoon","time":"14:00","name":"Grand Bazaar","note":""},
        {"id":"a3","day":3,"period":"Evening","time":"19:00","name":"Bosphorus cruise","note":""},
        {"id":"a4","day":5,"period":"Morning","time":"10:00","name":"Topkapı Palace","note":""}]'::jsonb,
      '[{"id":"e1","label":"Flights","category":"Transportation","amount":260},{"id":"e2","label":"Apartment","category":"Accommodation","amount":380},
        {"id":"e3","label":"Food","category":"Food & Drinks","amount":210},{"id":"e4","label":"Bazaar","category":"Shopping","amount":95}]'::jsonb,
      'Best baklava of my life.'),
    ('brasov', date '2026-04-25', date '2026-04-29', 600, 'Family', array['Nature','Culture'],
      array['brasov','brasov','brasov','sibiu','sibiu'],
      '[{"id":"brasov","name":"Brașov","country":"Romania","countryCode":"RO","latitude":45.6427,"longitude":25.5887},
        {"id":"sibiu","name":"Sibiu","country":"Romania","countryCode":"RO","latitude":45.7983,"longitude":24.1256}]'::jsonb,
      '[{"id":"a1","day":1,"period":"Afternoon","time":"15:00","name":"Black Church","note":""},
        {"id":"a2","day":2,"period":"Morning","time":"09:00","name":"Mount Tâmpa","note":""},
        {"id":"a3","day":4,"period":"Morning","time":"10:00","name":"Large Square","note":""}]'::jsonb,
      '[{"id":"e1","label":"Guesthouse","category":"Accommodation","amount":240},{"id":"e2","label":"Fuel","category":"Transportation","amount":70},
        {"id":"e3","label":"Food","category":"Food & Drinks","amount":150}]'::jsonb,
      'Spring in Transylvania.'),
    ('rome', date '2026-05-28', date '2026-06-03', 1800, 'Partner', array['Culture','Food','Beach'],
      array['rome','rome','rome','rome','positano','positano','positano'],
      '[{"id":"rome","name":"Rome","country":"Italy","countryCode":"IT","latitude":41.9028,"longitude":12.4964},
        {"id":"positano","name":"Positano","country":"Italy","countryCode":"IT","latitude":40.628,"longitude":14.485}]'::jsonb,
      '[{"id":"a1","day":1,"period":"Morning","time":"09:00","name":"Colosseum","note":""},
        {"id":"a2","day":2,"period":"Morning","time":"10:00","name":"Vatican Museums","note":""},
        {"id":"a3","day":3,"period":"Evening","time":"20:00","name":"Trastevere dinner","note":""},
        {"id":"a4","day":5,"period":"Afternoon","time":"13:00","name":"Spiaggia Grande","note":""},
        {"id":"a5","day":6,"period":"Morning","time":"08:30","name":"Path of the Gods","note":""}]'::jsonb,
      '[{"id":"e1","label":"Flights","category":"Transportation","amount":340},{"id":"e2","label":"Hotels","category":"Accommodation","amount":860},
        {"id":"e3","label":"Food","category":"Food & Drinks","amount":420},{"id":"e4","label":"Boat trip","category":"Activities","amount":120}]'::jsonb,
      'Pasta every day, no regrets.'),
    ('lisbon', date '2026-07-18', date '2026-07-23', 1000, 'Friends', array['City','Food'],
      array['lisbon','lisbon','lisbon','lisbon','lisbon','lisbon'],
      '[{"id":"lisbon","name":"Lisbon","country":"Portugal","countryCode":"PT","latitude":38.7223,"longitude":-9.1393}]'::jsonb,
      '[{"id":"a1","day":1,"period":"Afternoon","time":"16:00","name":"Alfama","note":""},
        {"id":"a2","day":2,"period":"Morning","time":"10:00","name":"Belém Tower","note":""},
        {"id":"a3","day":4,"period":"Morning","time":"09:00","name":"Sintra","note":""}]'::jsonb,
      '[{"id":"e1","label":"Flights","category":"Transportation","amount":220},{"id":"e2","label":"Airbnb","category":"Accommodation","amount":450},
        {"id":"e3","label":"Pastéis & dinners","category":"Food & Drinks","amount":230}]'::jsonb,
      'Back to Lisbon, still in love.'),
    ('tokyo', date '2026-08-20', date '2026-08-30', 3200, 'Partner', array['City','Culture','Food'],
      array['tokyo','tokyo','tokyo','tokyo','tokyo','kyoto','kyoto','kyoto','kyoto','tokyo','tokyo'],
      '[{"id":"tokyo","name":"Tokyo","country":"Japan","countryCode":"JP","latitude":35.6762,"longitude":139.6503},
        {"id":"kyoto","name":"Kyoto","country":"Japan","countryCode":"JP","latitude":35.0116,"longitude":135.7681}]'::jsonb,
      '[{"id":"a1","day":1,"period":"Evening","time":"19:00","name":"Shibuya Crossing","note":""},
        {"id":"a2","day":2,"period":"Morning","time":"08:00","name":"Tsukiji Outer Market","note":""},
        {"id":"a3","day":4,"period":"Afternoon","time":"14:00","name":"teamLab Planets","note":""},
        {"id":"a4","day":6,"period":"Morning","time":"07:30","name":"Fushimi Inari","note":""},
        {"id":"a5","day":7,"period":"Morning","time":"09:00","name":"Arashiyama Bamboo Grove","note":""},
        {"id":"a6","day":10,"period":"Afternoon","time":"15:00","name":"Akihabara","note":""}]'::jsonb,
      '[{"id":"e1","label":"Flights","category":"Transportation","amount":1150},{"id":"e2","label":"Hotels","category":"Accommodation","amount":1300},
        {"id":"e3","label":"Shinkansen","category":"Transportation","amount":220},{"id":"e4","label":"Food","category":"Food & Drinks","amount":540}]'::jsonb,
      'The trip of the year.'),
    ('cluj-napoca', date '2026-09-10', date '2026-09-14', 450, 'Friends', array['City','Food'],
      array['cluj-napoca','cluj-napoca','cluj-napoca','cluj-napoca','cluj-napoca'],
      '[{"id":"cluj-napoca","name":"Cluj-Napoca","country":"Romania","countryCode":"RO","latitude":46.7712,"longitude":23.6236}]'::jsonb,
      '[{"id":"a1","day":2,"period":"Morning","time":"10:00","name":"Turda Salt Mine","note":""},
        {"id":"a2","day":3,"period":"Afternoon","time":"15:00","name":"Botanical Garden","note":""}]'::jsonb,
      '[{"id":"e1","label":"Hotel","category":"Accommodation","amount":220},{"id":"e2","label":"Food","category":"Food & Drinks","amount":130}]'::jsonb,
      'Weekend with the gang.'),
    ('budapest', date '2026-10-16', date '2026-10-19', 700, 'Partner', array['City','Culture'],
      array['budapest','budapest','budapest','budapest'],
      '[{"id":"budapest","name":"Budapest","country":"Hungary","countryCode":"HU","latitude":47.4979,"longitude":19.0402}]'::jsonb,
      '[{"id":"a1","day":1,"period":"Evening","time":"19:30","name":"Danube night cruise","note":""},
        {"id":"a2","day":2,"period":"Morning","time":"09:00","name":"Széchenyi Baths","note":""},
        {"id":"a3","day":3,"period":"Afternoon","time":"14:00","name":"Fisherman''s Bastion","note":""}]'::jsonb,
      '[{"id":"e1","label":"Hotel","category":"Accommodation","amount":310},{"id":"e2","label":"Baths","category":"Activities","amount":60},
        {"id":"e3","label":"Food","category":"Food & Drinks","amount":160}]'::jsonb,
      'Thermal baths in the rain.')
  ) as seed(destination_id, start_date, end_date, budget, companions, interests, day_destinations, route_stops, activities, expenses, reflection);

  -- Czechia and Hungary have no visa in the visa seed; these trips would have issued them.
  insert into public.visas (user_id, country_code, entries, cities, first_entry, last_entry, stamps, seen)
  values
    (tester, 'CZ', 1, array['Prague'], date '2026-02-15', date '2026-02-16', '[{"date":"2026-02-15"}]'::jsonb, true),
    (tester, 'HU', 1, array['Budapest'], date '2026-10-16', date '2026-10-19', '[{"date":"2026-10-16"}]'::jsonb, true)
  on conflict (user_id, country_code) do nothing;
end $$;

-- Check what was added:
-- select destination_id, start_date, end_date from public.trip_journal_entries
-- where user_id = (select id from auth.users where lower(email) = 'andreitest@test.com')
--   and id = md5(user_id::text || destination_id || start_date::text)::uuid order by start_date;

-- Cleanup, when you are done testing (uncomment and run):
-- delete from public.trip_journal_entries where user_id = (select id from auth.users where lower(email) = 'andreitest@test.com')
--   and id = md5(user_id::text || destination_id || start_date::text)::uuid;
-- delete from public.visas where user_id = (select id from auth.users where lower(email) = 'andreitest@test.com')
--   and country_code in ('CZ','HU') and first_entry in (date '2026-02-15', date '2026-10-16');
