-- GIL:ON schema (contract in context/be.md) + travel modes. Run once in Supabase SQL Editor, or `supabase db push`.
-- Requires: Authentication > Providers > Anonymous sign-ins = ON.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'User',
  lang text not null default 'en' check (lang in ('en','id','ko')),
  country text not null default 'ID' check (country in ('ID','KR')),
  id_verified_mock boolean not null default false,   -- hanya flag mockup, tanpa data KTP
  travel_mode text not null default 'walk' check (travel_mode in ('walk','wheelchair')),
  voice_guidance boolean not null default false,
  created_at timestamptz not null default now()
);
create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  name text not null, phone text not null,            -- format +62..., +82...
  channel text not null default 'whatsapp' check (channel in ('whatsapp','kakao','sms')),
  created_at timestamptz not null default now()
);
create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  graph_version text not null,
  origin jsonb not null, destination jsonb not null,  -- {"lat","lng","label"}
  departure_at timestamptz not null,
  chosen text not null check (chosen in ('fastest','safest')),
  mode text not null default 'walk' check (mode in ('walk','wheelchair')),
  route_options jsonb not null,                       -- {"fastest": RouteOption, "safest": RouteOption}
  status text not null default 'active' check (status in ('active','arrived','sos','cancelled')),
  started_at timestamptz not null default now(),
  eta timestamptz not null,
  arrived_at timestamptz,
  share_token text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,16),
  rating smallint check (rating between 1 and 5),
  rating_comment text check (char_length(rating_comment) <= 280)
);
create table trip_locations (
  id bigserial primary key,
  trip_id uuid not null references trips on delete cascade,
  lat double precision not null, lng double precision not null, accuracy_m real,
  recorded_at timestamptz not null default now()
);
create table reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  graph_version text not null, segment_id int,
  lat double precision not null, lng double precision not null,
  category text not null check (category in ('dark','deserted','harassment','broken_light','other')),
  note text check (char_length(note) <= 280),
  photo_path text,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);
create table report_confirmations (
  report_id uuid references reports on delete cascade,
  user_id uuid default auth.uid() references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
create table sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  trip_id uuid references trips on delete set null,
  lat double precision, lng double precision,
  country text not null, number_called text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), resolved_at timestamptz
);

-- profil otomatis saat sign-in pertama
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles(id) values (new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- RLS: semua tabel aktif, default tertutup
alter table profiles enable row level security;            alter table emergency_contacts enable row level security;
alter table trips enable row level security;               alter table trip_locations enable row level security;
alter table reports enable row level security;             alter table report_confirmations enable row level security;
alter table sos_events enable row level security;
create policy own_profile on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy own_contacts on emergency_contacts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_trips on trips for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_locations on trip_locations for all
  using (exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy own_sos on sos_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy read_reports on reports for select to authenticated using (true);
create policy insert_report on reports for insert to authenticated with check (user_id = auth.uid());
create policy delete_own_report on reports for delete using (user_id = auth.uid());
create policy read_confirms on report_confirmations for select to authenticated using (true);
create policy confirm_others on report_confirmations for insert to authenticated
  with check (user_id = auth.uid() and not exists (select 1 from reports r where r.id = report_id and r.user_id = auth.uid()));

-- laporan untuk ditampilkan (anonim: tanpa user_id)
create view reports_public with (security_invoker = true) as
select r.id, r.graph_version, r.segment_id, r.lat, r.lng, r.category, r.note, r.photo_path, r.is_simulated, r.created_at,
       count(c.user_id)::int as confirm_count,
       (r.user_id = auth.uid()) as is_mine,
       coalesce(bool_or(c.user_id = auth.uid()), false) as confirmed_by_me
from reports r left join report_confirmations c on c.report_id = r.id group by r.id;

-- rating agregat per segmen (hanya angka agregat yang terbuka)
create view segment_ratings as
select graph_version, (jsonb_array_elements_text(route_options -> chosen -> 'segment_ids'))::int as segment_id,
       avg(rating)::real as avg_rating, count(*)::int as n
from trips where rating is not null group by 1, 2;
grant select on segment_ratings to anon, authenticated;
grant select on reports_public to authenticated;

-- halaman pantau teman, tanpa login, hanya lewat token dan maks 12 jam
create function get_shared_trip(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', t.status, 'display_name', p.display_name, 'destination_label', t.destination->>'label', 'eta', t.eta,
    'route_geometry', t.route_options -> t.chosen -> 'geometry',
    'last_location', (select jsonb_build_object('lat', l.lat, 'lng', l.lng, 'recorded_at', l.recorded_at)
                      from trip_locations l where l.trip_id = t.id order by l.recorded_at desc limit 1),
    'sos', (select jsonb_build_object('created_at', s.created_at, 'lat', s.lat, 'lng', s.lng)
            from sos_events s where s.trip_id = t.id and s.resolved_at is null order by s.created_at desc limit 1))
  from trips t join profiles p on p.id = t.user_id
  where t.share_token = p_token and t.started_at > now() - interval '12 hours';
$$;
grant execute on function get_shared_trip(text) to anon, authenticated;
-- is_late dihitung di klien: status = 'active' dan now > eta + LATE_GRACE_MIN

-- storage: bucket publik 'report-photos', upload hanya ke folder <user_id>/
insert into storage.buckets (id, name, public) values ('report-photos', 'report-photos', true);
create policy upload_own_photo on storage.objects for insert to authenticated
  with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy read_photos on storage.objects for select using (bucket_id = 'report-photos');

-- trip_locations: index for "latest location" lookups on the shared page
create index trip_locations_trip_time on trip_locations (trip_id, recorded_at desc);
create index sos_events_trip on sos_events (trip_id) where resolved_at is null;
