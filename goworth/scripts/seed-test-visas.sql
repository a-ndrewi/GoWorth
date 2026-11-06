-- Test data only: gives andreitest@test.com a passport with 10 visas and 30 days of Premium, so the passport share
-- card can be tried. Run it in the Supabase dashboard, SQL Editor, on the project the app uses.
-- Safe to run again: it replaces the same rows. The cleanup at the bottom removes everything it adds.

do $$
declare
  tester uuid := (select id from auth.users where lower(email) = 'andreitest@test.com');
begin
  if tester is null then raise exception 'No account with the email andreitest@test.com'; end if;

  insert into public.visas as v (user_id, country_code, entries, cities, first_entry, last_entry, stamps, seen)
  select tester, code, jsonb_array_length(stamps), cities, first_entry, last_entry, stamps, true
  from (values
    ('IT', array['Rome','Florence','Venice'], date '2025-04-12', date '2026-06-03', '[{"date":"2025-04-12"},{"date":"2026-05-28"}]'::jsonb),
    ('FR', array['Paris','Nice'],             date '2025-05-20', date '2025-05-26', '[{"date":"2025-05-20"}]'::jsonb),
    ('ES', array['Barcelona','Madrid'],       date '2025-06-14', date '2025-06-21', '[{"date":"2025-06-14"}]'::jsonb),
    ('GR', array['Santorini','Athens'],       date '2025-07-08', date '2025-07-15', '[{"date":"2025-07-08"}]'::jsonb),
    ('PT', array['Lisbon','Porto'],           date '2025-08-02', date '2025-08-09', '[{"date":"2025-08-02"}]'::jsonb),
    ('JP', array['Tokyo','Kyoto'],            date '2025-10-01', date '2025-10-12', '[{"date":"2025-10-01"}]'::jsonb),
    ('GB', array['London','Edinburgh'],       date '2025-11-18', date '2025-11-23', '[{"date":"2025-11-18"}]'::jsonb),
    ('AT', array['Vienna'],                   date '2025-12-19', date '2025-12-22', '[{"date":"2025-12-19"}]'::jsonb),
    ('TR', array['Istanbul'],                 date '2026-03-06', date '2026-03-11', '[{"date":"2026-03-06"}]'::jsonb),
    ('RO', array['Brașov','Sibiu','Cluj-Napoca'], date '2026-04-25', date '2026-09-14', '[{"date":"2026-04-25"},{"date":"2026-09-10"}]'::jsonb)
  ) as seed(code, cities, first_entry, last_entry, stamps)
  on conflict (user_id, country_code) do update set
    entries = excluded.entries, cities = excluded.cities, first_entry = excluded.first_entry,
    last_entry = excluded.last_entry, stamps = excluded.stamps, seen = true;

  -- Sharing the passport is Premium; this test Premium ends on its own after 30 days.
  insert into public.user_entitlements as e (user_id, plan, valid_until, provider, updated_at)
  values (tester, 'premium', now() + interval '30 days', 'test', now())
  on conflict (user_id) do update set plan = 'premium', valid_until = now() + interval '30 days',
    provider = 'test', provider_reference = null, updated_at = now()
  where e.plan <> 'lifetime';
end $$;

-- Check what was added:
-- select country_code, entries, cities from public.visas
-- where user_id = (select id from auth.users where lower(email) = 'andreitest@test.com') order by first_entry;

-- Cleanup, when you are done testing (uncomment and run):
-- delete from public.visas where user_id = (select id from auth.users where lower(email) = 'andreitest@test.com')
--   and country_code in ('IT','FR','ES','GR','PT','JP','GB','AT','TR','RO');
-- update public.user_entitlements set plan = 'free', valid_until = null, provider = null, updated_at = now()
--   where user_id = (select id from auth.users where lower(email) = 'andreitest@test.com') and provider = 'test';
