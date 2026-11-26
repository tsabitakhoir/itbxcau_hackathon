-- Reset demo data before the progress / final presentation (run in Supabase SQL Editor).
-- Keeps users, profiles and emergency contacts. Removes trips, locations, SOS and real (non-simulated) reports,
-- then re-seeds simulated community reports around ITB so the demo story is the same every time.
delete from sos_events;
delete from trips;                         -- cascades to trip_locations
delete from reports where not is_simulated;
delete from report_confirmations;
delete from reports where is_simulated;

-- 4 dummy users: user 4 is the reporter, users 1-3 confirm (CONFIRM_THRESHOLD = 3)
do $$
declare u uuid; i int;
begin
  for i in 1..4 loop
    u := ('00000000-0000-4000-8000-00000000000' || i)::uuid;
    insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
      values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now())
      on conflict (id) do nothing;
    insert into profiles (id, display_name) values (u, 'Demo ' || i) on conflict (id) do nothing;
  end loop;
end $$;

-- simulated reports around ITB (matched to the nearest street within 40 m at routing time).
-- Move these points onto the demo "fastest" alley once you've checked the route on the map.
insert into reports (id, user_id, graph_version, lat, lng, category, note, is_simulated, created_at) values
  ('11111111-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'seed', -6.88745, 107.61530, 'dark', 'Lampu jalan mati di gang', true, now() - interval '2 days'),
  ('11111111-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', 'seed', -6.88610, 107.61420, 'deserted', 'Sepi setelah jam 21', true, now() - interval '5 days'),
  ('11111111-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', 'seed', -6.89490, 107.60850, 'broken_light', 'Lampu rusak', true, now() - interval '1 day'),
  ('11111111-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'seed', -6.88300, 107.61150, 'harassment', 'Catcalling dilaporkan', true, now() - interval '3 days'),
  -- CONFIRM_THRESHOLD - 1 confirmations: a phone taps "Confirm" live during the demo and the route score changes
  ('11111111-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004', 'seed', -6.88820, 107.61650, 'dark', 'Gelap dekat kos', true, now() - interval '6 hours');

insert into report_confirmations (report_id, user_id)
select r.id, u.id from reports r
cross join (values ('00000000-0000-4000-8000-000000000001'::uuid), ('00000000-0000-4000-8000-000000000002'::uuid), ('00000000-0000-4000-8000-000000000003'::uuid)) as u(id)
where r.is_simulated and (r.id <> '11111111-0000-4000-8000-000000000005' or u.id <> '00000000-0000-4000-8000-000000000003');
