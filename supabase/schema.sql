-- ─────────────────────────────────────────────────────────────
--  BOLSILLO WORM · database
--  Two worms, two pockets, one hole between them.
--  Safe to run more than once.
-- ─────────────────────────────────────────────────────────────

-- ── tables ──────────────────────────────────────────────────

create table if not exists public.holes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  created_at    timestamptz not null default now(),
  tunnel_km     double precision not null default 5000,
  dug_km        double precision not null default 0,
  tunnels_done  int not null default 0,
  touches       int not null default 0,
  reunion_on    date,
  reunion_note  text
);
-- the day the current countdown started, so the Us card can show how far along you are
alter table public.holes add column if not exists reunion_from date;


create table if not exists public.members (
  hole_id    uuid not null references public.holes(id) on delete cascade,
  slot       smallint not null check (slot in (0, 1)),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  worm       jsonb not null default '{}',
  place      jsonb not null default '{}',
  push       jsonb,
  joined_at  timestamptz not null default now(),
  seen_at    timestamptz not null default now(),
  fed_at     timestamptz not null default now(),
  misted_at  timestamptz not null default now(),
  petted_at  timestamptz not null default now(),
  love       int not null default 0,
  primary key (hole_id, slot)
);

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  hole_id     uuid not null references public.holes(id) on delete cascade,
  from_slot   smallint not null,
  kind        text not null,
  payload     jsonb not null default '{}',
  media_id    bigint,
  created_at  timestamptz not null default now(),
  opened_at   timestamptz,
  kept        boolean not null default false,
  updated_at  timestamptz not null default now()
);
create index if not exists events_hole_time on public.events (hole_id, created_at desc);
-- updated_at lets a phone ask only for what changed since it last looked (opens, keeps,
-- pet counts), so coming back to the app doesn't reload the whole pocket.
alter table public.events add column if not exists updated_at timestamptz not null default now();
create index if not exists events_hole_updated on public.events (hole_id, updated_at desc);
create or replace function public.wh_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events for each row execute function public.wh_touch();

-- Photos and whispers. New ones live in Cloudflare R2 (`r2` = the object key, put there
-- by the media edge function, which also hands out short-lived links to read them).
-- Older ones still carry their bytes in `data` until the media function moves them.
create table if not exists public.media (
  id          bigint generated always as identity primary key,
  hole_id     uuid not null references public.holes(id) on delete cascade,
  mime        text not null,
  data        text,
  created_at  timestamptz not null default now()
);
alter table public.media alter column data drop not null;
alter table public.media add column if not exists r2 text;
alter table public.media add column if not exists bytes int;
alter table public.media add column if not exists slot smallint;
create index if not exists media_hole on public.media (hole_id);

-- the daily: one photo + one answer each, buried until you've both done yours
create table if not exists public.dailies (
  hole_id          uuid not null references public.holes(id) on delete cascade,
  day              date not null,
  slot             smallint not null,
  answer           text check (answer is null or char_length(answer) between 1 and 1000),
  answered_at      timestamptz,
  photo            bigint references public.media(id) on delete set null,
  thumb            text,
  photographed_at  timestamptz,
  primary key (hole_id, day, slot)
);

-- ── helpers ─────────────────────────────────────────────────

create or replace function public.wh_hole() returns uuid
language sql stable security definer set search_path = public as $$
  select hole_id from public.members where user_id = auth.uid()
$$;

create or replace function public.wh_slot() returns smallint
language sql stable security definer set search_path = public as $$
  select slot from public.members where user_id = auth.uid()
$$;

-- unguessable 8-char code, no look-alike characters
create or replace function public.wh_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  c text := '';
  i int;
begin
  for i in 0..7 loop
    c := c || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return c;
end $$;

-- great-circle distance between two places, in km
create or replace function public.wh_km(a jsonb, b jsonb) returns double precision
language sql immutable set search_path = public as $$
  select case
    when (a->>'lat') is null or (b->>'lat') is null then 5000
    else greatest(50, 6371 * 2 * asin(sqrt(
      power(sin(radians(((b->>'lat')::float8 - (a->>'lat')::float8) / 2)), 2) +
      cos(radians((a->>'lat')::float8)) * cos(radians((b->>'lat')::float8)) *
      power(sin(radians(((b->>'lon')::float8 - (a->>'lon')::float8) / 2)), 2)
    )))
  end
$$;

create or replace function public.wh_retunnel(p_hole uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a jsonb; b jsonb;
begin
  select place into a from members where hole_id = p_hole and slot = 0;
  select place into b from members where hole_id = p_hole and slot = 1;
  if a is not null and b is not null then
    update holes set tunnel_km = wh_km(a, b) where id = p_hole;
  end if;
end $$;

-- dig some tunnel; finishing one starts the next
create or replace function public.wh_dig_km(p_hole uuid, p_slot smallint, p_km double precision) returns void
language plpgsql security definer set search_path = public as $$
declare h holes;
begin
  if p_km <= 0 then return; end if;
  update holes set dug_km = dug_km + p_km where id = p_hole returning * into h;
  if h.dug_km >= h.tunnel_km then
    update holes set dug_km = h.dug_km - h.tunnel_km, tunnels_done = tunnels_done + 1 where id = p_hole;
    insert into events (hole_id, from_slot, kind, payload)
    values (p_hole, p_slot, 'tunnel', jsonb_build_object('n', h.tunnels_done + 1, 'km', round(h.tunnel_km)));
  end if;
end $$;

-- ── pairing ─────────────────────────────────────────────────

create or replace function public.wh_create(p_name text, p_worm jsonb, p_place jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h holes; c text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from members where user_id = uid) then raise exception 'already_in_hole'; end if;
  loop
    c := wh_code();
    exit when not exists (select 1 from holes where code = c);
  end loop;
  insert into holes (code) values (c) returning * into h;
  insert into members (hole_id, slot, user_id, name, worm, place)
  values (h.id, 0, uid, left(trim(p_name), 40), coalesce(p_worm, '{}'), coalesce(p_place, '{}'));
  return jsonb_build_object('hole_id', h.id, 'code', h.code, 'slot', 0);
end $$;

create or replace function public.wh_join(p_code text, p_name text, p_worm jsonb, p_place jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h holes; s smallint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from members where user_id = uid) then raise exception 'already_in_hole'; end if;
  select * into h from holes where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then raise exception 'no_such_hole'; end if;
  if (select count(*) from members where hole_id = h.id) >= 2 then
    return jsonb_build_object('full', true, 'worms',
      (select jsonb_agg(jsonb_build_object('slot', slot, 'name', name, 'worm', worm) order by slot)
       from members where hole_id = h.id));
  end if;
  s := case when exists (select 1 from members where hole_id = h.id and slot = 0) then 1 else 0 end;
  insert into members (hole_id, slot, user_id, name, worm, place)
  values (h.id, s, uid, left(trim(p_name), 40), coalesce(p_worm, '{}'), coalesce(p_place, '{}'));
  perform wh_retunnel(h.id);
  insert into events (hole_id, from_slot, kind) values (h.id, s, 'arrived');
  return jsonb_build_object('hole_id', h.id, 'code', h.code, 'slot', s);
end $$;

-- new phone? take your worm back with the code
create or replace function public.wh_reclaim(p_code text, p_slot smallint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h holes;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from members where user_id = uid) then raise exception 'already_in_hole'; end if;
  select * into h from holes where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then raise exception 'no_such_hole'; end if;
  update members set user_id = uid, push = null, seen_at = now()
  where hole_id = h.id and slot = p_slot;
  if not found then raise exception 'no_such_worm'; end if;
  return jsonb_build_object('hole_id', h.id, 'code', h.code, 'slot', p_slot);
end $$;

create or replace function public.wh_leave() returns void
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  delete from members where user_id = auth.uid() returning hole_id into h;
  if h is not null and not exists (select 1 from members where hole_id = h) then
    delete from holes where id = h;
  end if;
end $$;

-- ── me ──────────────────────────────────────────────────────

create or replace function public.wh_update_me(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  update members set
    name    = coalesce(left(nullif(trim(p->>'name'), ''), 40), name),
    worm    = case when p ? 'worm'  then p->'worm'  else worm  end,
    place   = case when p ? 'place' then p->'place' else place end,
    push    = case when p ? 'push'  then nullif(p->'push', 'null'::jsonb) else push end,
    seen_at = now()
  where hole_id = m.hole_id and slot = m.slot;
  if p ? 'place' then perform wh_retunnel(m.hole_id); end if;
end $$;

create or replace function public.wh_drop_push(p_slot smallint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update members set push = null where hole_id = wh_hole() and slot = p_slot;
end $$;

-- A file already in R2: the media function made the row, the app passes "media:<id>".
-- It has to be yours, in your pocket, and not attached to anything yet.
create or replace function public.wh_media_ref(m public.members, p_ref text) returns bigint
language plpgsql security definer set search_path = public as $$
declare mid bigint;
begin
  if p_ref !~ '^media:[0-9]{1,18}$' then raise exception 'bad_media'; end if;
  mid := substr(p_ref, 7)::bigint;
  perform 1 from media x where x.id = mid and x.hole_id = m.hole_id and x.slot = m.slot and x.r2 is not null
    and not exists (select 1 from events e where e.media_id = mid)
    and not exists (select 1 from dailies d where d.photo = mid);
  if not found then raise exception 'bad_media'; end if;
  return mid;
end $$;

-- ── doing things to each other ──────────────────────────────

create or replace function public.wh_act(p_kind text, p_payload jsonb default '{}', p_media text default null, p_mime text default null)
returns public.events
language plpgsql security definer set search_path = public as $$
declare
  m members; e events; mid bigint; other smallint; km float8; lv int;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if p_kind not in ('pet','boop','kiss','react','feed','mist','note','doodle','photo','whisper','wiggle','song','trinket','knock','ring','touch') then
    raise exception 'bad_kind';
  end if;
  if pg_column_size(coalesce(p_payload, '{}')) > 200000 then raise exception 'too_big'; end if;
  other := 1 - m.slot;

  -- pets and boops pile up into one event instead of a flood
  if p_kind in ('pet', 'boop') then
    select * into e from events
    where hole_id = m.hole_id and from_slot = m.slot and kind = p_kind
      and created_at > now() - interval '3 minutes'
    order by created_at desc limit 1;
    if found then
      update events set payload = jsonb_set(payload, '{n}', to_jsonb(coalesce((payload->>'n')::int, 1) + 1))
      where id = e.id returning * into e;
    end if;
  end if;

  if e.id is null then
    if p_media like 'media:%' then
      mid := wh_media_ref(m, p_media);
    elsif p_media is not null then
      if length(p_media) > 2500000 then raise exception 'too_big'; end if;
      insert into media (hole_id, mime, data, slot)
      values (m.hole_id, coalesce(p_mime, 'application/octet-stream'), p_media, m.slot) returning id into mid;
    end if;
    insert into events (hole_id, from_slot, kind, payload, media_id)
    values (m.hole_id, m.slot, p_kind, coalesce(p_payload, '{}'), mid) returning * into e;
  end if;

  km := case p_kind
    when 'pet' then 2 when 'boop' then 1 when 'feed' then 8 when 'mist' then 6
    when 'kiss' then 6 * least(5, greatest(1, coalesce((p_payload->>'level')::int, 1)))
    when 'note' then 40 when 'doodle' then 40 when 'photo' then 35 when 'whisper' then 45
    when 'wiggle' then 15 when 'song' then 30 when 'trinket' then 20 when 'knock' then 4 when 'touch' then 60 when 'react' then 3
    else 0 end;
  lv := case p_kind
    when 'pet' then 1 when 'boop' then 1 when 'feed' then 3 when 'mist' then 2
    when 'kiss' then 2 * least(5, greatest(1, coalesce((p_payload->>'level')::int, 1)))
    when 'touch' then 5 when 'knock' then 1 when 'react' then 1 when 'ring' then 0 else 4 end;

  -- care lands on the partner's worm, the one living in my pocket
  update members set
    petted_at = case when p_kind in ('pet', 'boop', 'kiss', 'touch') then now() else petted_at end,
    fed_at    = case when p_kind = 'feed' then now() else fed_at end,
    misted_at = case when p_kind = 'mist' then now() else misted_at end,
    love      = love + lv
  where hole_id = m.hole_id and slot = other;

  if p_kind = 'touch' then update holes set touches = touches + 1 where id = m.hole_id; end if;
  update members set seen_at = now() where hole_id = m.hole_id and slot = m.slot;
  perform wh_dig_km(m.hole_id, m.slot, km);
  return e;
end $$;

create or replace function public.wh_open(p_id bigint, p_keep boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  update events set
    opened_at = coalesce(opened_at, case when from_slot <> m.slot then now() end),
    kept      = coalesce(p_keep, kept)
  where id = p_id and hole_id = m.hole_id;
end $$;

create or replace function public.wh_set_reunion(p_on date, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  -- a new countdown (none set, or the last one has passed) starts today; moving the date
  -- or the place of a running one keeps its start, so the bar doesn't jump back
  update holes set
    reunion_from = case when reunion_on is null or reunion_on < wh_today(m.hole_id) or reunion_from is null
                        then wh_today(m.hole_id) else reunion_from end,
    reunion_on = p_on, reunion_note = left(p_note, 80)
  where id = m.hole_id;
  insert into events (hole_id, from_slot, kind, payload)
  values (m.hole_id, m.slot, 'reunion', jsonb_build_object('on', p_on, 'note', left(p_note, 80)));
end $$;

-- ── the daily: a photo and an answer ────────────────────────

create or replace function public.wh_daily(p_day date, p_answer text default null, p_photo text default null,
                                            p_mime text default null, p_thumb text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m members; d dailies; mid bigint; part text; fresh boolean := false; is_both boolean := false;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if p_day < current_date - 2 or p_day > current_date + 2 then raise exception 'bad_day'; end if;
  if p_answer is null and p_photo is null then raise exception 'empty'; end if;

  insert into dailies (hole_id, day, slot) values (m.hole_id, p_day, m.slot)
  on conflict (hole_id, day, slot) do nothing;
  select * into d from dailies where hole_id = m.hole_id and day = p_day and slot = m.slot;

  if p_answer is not null and length(trim(p_answer)) > 0 then
    part := 'answer';
    fresh := d.answered_at is null;
    update dailies set answer = left(trim(p_answer), 1000), answered_at = coalesce(answered_at, now())
    where hole_id = m.hole_id and day = p_day and slot = m.slot;
    is_both := (select count(*) from dailies where hole_id = m.hole_id and day = p_day and answered_at is not null) = 2;
  end if;

  if p_photo is not null then
    part := 'photo';
    fresh := d.photographed_at is null;
    if p_photo like 'media:%' then
      mid := wh_media_ref(m, p_photo);
    else
      if length(p_photo) > 2500000 then raise exception 'too_big'; end if;
      insert into media (hole_id, mime, data, slot) values (m.hole_id, coalesce(p_mime, 'image/jpeg'), p_photo, m.slot) returning id into mid;
    end if;
    update dailies set photo = mid, thumb = left(p_thumb, 60000), photographed_at = coalesce(photographed_at, now())
    where hole_id = m.hole_id and day = p_day and slot = m.slot;
    is_both := (select count(*) from dailies where hole_id = m.hole_id and day = p_day and photographed_at is not null) = 2;
  end if;

  if fresh then
    insert into events (hole_id, from_slot, kind, payload)
    values (m.hole_id, m.slot, 'daily', jsonb_build_object('day', p_day, 'part', part, 'both', is_both));
    update members set love = love + 4 where hole_id = m.hole_id and slot = 1 - m.slot;
    perform wh_dig_km(m.hole_id, m.slot, case when is_both then 120 else 50 end);
  end if;
  return jsonb_build_object('part', part, 'both', is_both, 'fresh', fresh);
end $$;

-- your partner's half only comes up once you've done yours
create or replace function public.wh_dailies(p_limit int default 120)
returns table (day date,
               my_answer text, their_answer text, their_answered boolean,
               my_photo bigint, my_thumb text, their_photo bigint, their_thumb text, their_photographed boolean)
language plpgsql stable security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  return query
    select x.day,
      me.answer,
      case when me.answered_at is not null then th.answer end,
      th.answered_at is not null,
      me.photo, me.thumb,
      case when me.photographed_at is not null then th.photo end,
      case when me.photographed_at is not null then th.thumb end,
      th.photographed_at is not null
    from (select distinct dd.day from dailies dd where dd.hole_id = m.hole_id) x
    left join dailies me on me.hole_id = m.hole_id and me.day = x.day and me.slot = m.slot
    left join dailies th on th.hole_id = m.hole_id and th.day = x.day and th.slot = 1 - m.slot
    order by x.day desc
    limit p_limit;
end $$;

-- ── seeds: questions you plant for each other ──────────────
-- A planted question takes the place of the daily one on a coming day. Hidden from
-- your partner until it comes up. Seeds from the two of you always alternate
-- (Manu, Nov 10): if one of you plants ten and the other one, the days go
-- A, B, A, A, A… not A ×10 then B. Every plant or dig-up re-deals the coming days.

create table if not exists public.planted (
  hole_id     uuid not null references public.holes(id) on delete cascade,
  day         date not null,
  from_slot   smallint not null check (from_slot in (0, 1)),
  question    text not null check (char_length(question) between 3 and 200),
  created_at  timestamptz not null default now(),
  id          uuid not null default gen_random_uuid(),
  primary key (hole_id, day)
);
alter table public.planted add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists planted_id on public.planted (id);

-- "today" for a hole: the date where the first worm lives (the app uses the same rule)
create or replace function public.wh_today(p_hole uuid) returns date
language plpgsql stable security definer set search_path = public as $$
declare tz text;
begin
  select nullif(place->>'tz', '') into tz from members where hole_id = p_hole and slot = 0;
  begin
    return (now() at time zone coalesce(tz, 'UTC'))::date;
  exception when others then
    return (now() at time zone 'UTC')::date;
  end;
end $$;

-- Re-deal the coming days: each person's seeds keep their planting order, the two
-- lists are zipped (whoever planted first opens), and they fill the days from
-- tomorrow with no gaps. Not callable from the app; wh_plant / wh_unplant run it.
create or replace function public.wh_reseed(p_hole uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t date := wh_today(p_hole); d date; r record;
begin
  perform pg_advisory_xact_lock(hashtext('planted:' || p_hole::text));
  -- step aside first: the primary key is (hole, day)
  update planted set day = day + 10000 where hole_id = p_hole and day > t;
  d := t + 1;
  for r in
    with q as (
      select p.id, p.from_slot, p.created_at,
             row_number() over (partition by p.from_slot order by p.created_at, p.id) as n
      from planted p where p.hole_id = p_hole and p.day > t
    ), lead as (select from_slot from q order by created_at, id limit 1)
    select q.id from q, lead
    order by q.n, (q.from_slot <> lead.from_slot), q.created_at, q.id
  loop
    update planted set day = d where id = r.id;
    update events set payload = payload || jsonb_build_object('day', d)
      where hole_id = p_hole and kind = 'plant' and payload->>'seed' = r.id::text;
    d := d + 1;
  end loop;
end $$;

create or replace function public.wh_plant(p_question text) returns date
language plpgsql security definer set search_path = public as $$
declare m members; q text := btrim(coalesce(p_question, '')); d date; sid uuid;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if char_length(q) < 3 or char_length(q) > 200 then raise exception 'bad_question'; end if;
  perform pg_advisory_xact_lock(hashtext('planted:' || m.hole_id::text));
  if (select count(*) from planted p where p.hole_id = m.hole_id and p.from_slot = m.slot and p.day > wh_today(m.hole_id)) >= 7 then
    raise exception 'too_many_seeds';
  end if;
  -- park it on a free far-off day; the re-deal gives it its real one
  d := wh_today(m.hole_id) + 20000;
  loop
    begin
      insert into planted (hole_id, day, from_slot, question) values (m.hole_id, d, m.slot, q) returning id into sid;
      exit;
    exception when unique_violation then
      d := d + 1;
    end;
  end loop;
  perform wh_reseed(m.hole_id);
  select p.day into d from planted p where p.id = sid;
  insert into events (hole_id, from_slot, kind, payload) values (m.hole_id, m.slot, 'plant', jsonb_build_object('day', d, 'seed', sid));
  perform wh_dig_km(m.hole_id, m.slot, 20);
  return d;
end $$;

-- dig a seed back up before it comes up; the seeds after it move up a day
create or replace function public.wh_unplant(p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare m members; sid uuid;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  perform pg_advisory_xact_lock(hashtext('planted:' || m.hole_id::text));
  delete from planted p where p.hole_id = m.hole_id and p.day = p_day and p.from_slot = m.slot and p.day > wh_today(m.hole_id) returning p.id into sid;
  if sid is null then return; end if;
  delete from events e where e.hole_id = m.hole_id and e.kind = 'plant' and e.from_slot = m.slot
    and (e.payload->>'seed' = sid::text or (e.payload->>'seed' is null and e.payload->>'day' = p_day::text));
  perform wh_reseed(m.hole_id);
end $$;

-- your seeds, plus theirs once they've come up
create or replace function public.wh_planted()
returns table (day date, from_slot smallint, question text)
language plpgsql stable security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  return query
    select p.day, p.from_slot, p.question from planted p
    where p.hole_id = m.hole_id and (p.from_slot = m.slot or p.day <= wh_today(m.hole_id))
    order by p.day desc;
end $$;

-- counts for the year-end zine
create or replace function public.wh_stats(p_from timestamptz, p_to timestamptz)
returns table (kind text, from_slot smallint, n bigint)
language plpgsql stable security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  return query
    select e.kind, e.from_slot, sum(coalesce((e.payload->>'n')::int, 1))::bigint
    from events e
    where e.hole_id = m.hole_id and e.created_at >= p_from and e.created_at < p_to
    group by e.kind, e.from_slot;
end $$;

-- ── the shelf: things left for later ────────────────────────
-- "Open when…" envelopes and date-locked capsules. The event only carries the outside
-- of the envelope; what's inside lives in `sealed`, out of reach until the recipient
-- opens it (and, for capsules, until the day comes).

create table if not exists public.sealed (
  event_id  bigint primary key references public.events(id) on delete cascade,
  hole_id   uuid not null references public.holes(id) on delete cascade,
  body      jsonb not null default '{}',
  photo     text,
  mime      text
);

create or replace function public.wh_seal(p_payload jsonb, p_body jsonb default '{}', p_photo text default null, p_mime text default null)
returns public.events
language plpgsql security definer set search_path = public as $$
declare
  m members; e events;
  v_mode text := p_payload->>'mode';
  v_label text := left(btrim(coalesce(p_payload->>'label', '')), 60);
  v_on date;
  v_today date;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  v_today := wh_today(m.hole_id);
  if v_mode is null or v_mode not in ('when', 'date') then raise exception 'bad_mode'; end if;
  if v_mode = 'when' and char_length(v_label) < 2 then raise exception 'bad_label'; end if;
  if v_mode = 'date' then
    begin v_on := (p_payload->>'on')::date; exception when others then raise exception 'bad_date'; end;
    if v_on is null or v_on <= v_today or v_on > v_today + 3660 then raise exception 'bad_date'; end if;
  end if;
  if coalesce(char_length(btrim(p_body->>'text')), 0) = 0 and p_photo is null then raise exception 'empty'; end if;
  if char_length(coalesce(p_body->>'text', '')) > 1000 or pg_column_size(coalesce(p_body, '{}')) > 120000
     or length(coalesce(p_photo, '')) > 2500000 then raise exception 'too_big'; end if;

  insert into events (hole_id, from_slot, kind, payload)
  values (m.hole_id, m.slot, 'later', jsonb_build_object(
    'mode', v_mode, 'label', nullif(v_label, ''), 'on', v_on, 'photo', p_photo is not null,
    'paper', coalesce(nullif(p_payload->>'paper', ''), 'rosa')))
  returning * into e;
  insert into sealed (event_id, hole_id, body, photo, mime)
  values (e.id, m.hole_id, jsonb_build_object('text', p_body->>'text', 'paper', p_body->>'paper', 'thumb', p_body->>'thumb', 'caption', p_body->>'caption'), p_photo, p_mime);
  update members set love = love + 4 where hole_id = m.hole_id and slot = 1 - m.slot;
  perform wh_dig_km(m.hole_id, m.slot, 40);
  return e;
end $$;

-- open it (recipient) or look inside your own (sender)
create or replace function public.wh_unseal(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; e events; s sealed;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  select * into e from events where id = p_id and hole_id = m.hole_id and kind = 'later';
  if not found then raise exception 'not_found'; end if;
  if e.from_slot <> m.slot then
    if e.payload->>'mode' = 'date' and (e.payload->>'on')::date > wh_today(m.hole_id) then raise exception 'not_yet'; end if;
    if e.opened_at is null then
      update events set opened_at = now() where id = e.id returning * into e;
      insert into events (hole_id, from_slot, kind, payload)
      values (m.hole_id, m.slot, 'unsealed', jsonb_build_object('to', e.id, 'label', e.payload->>'label', 'mode', e.payload->>'mode', 'on', e.payload->>'on'));
      update members set love = love + 2 where hole_id = m.hole_id and slot = 1 - m.slot;
    end if;
  end if;
  select * into s from sealed where event_id = e.id;
  return jsonb_build_object('body', coalesce(s.body, '{}'), 'photo', s.photo, 'mime', s.mime, 'opened_at', e.opened_at);
end $$;

-- ── the house: questions about each other build Garden and House ──
-- You each write as many questions about yourself as you like (multiple choice or
-- yes / no) and answer one of the other's a day. Every right answer, from either of you,
-- puts up one piece of the same house. The right answer stays here, out of reach of the
-- other phone, until they've answered.

create table if not exists public.house_questions (
  id            uuid primary key default gen_random_uuid(),
  hole_id       uuid not null references public.holes(id) on delete cascade,
  from_slot     smallint not null check (from_slot in (0, 1)),
  kind          text not null check (kind in ('choice', 'yesno')),
  question      text not null check (char_length(question) between 3 and 200),
  options       jsonb not null,
  answer        smallint not null,
  created_at    timestamptz not null default now(),
  answered_at   timestamptz,
  answered_day  date,
  picked        smallint,
  correct       boolean
);
create index if not exists house_q_hole on public.house_questions (hole_id, created_at);
-- one answer a day each: the answerer is always the other slot, so (from_slot, day) is unique
create unique index if not exists house_q_one_a_day on public.house_questions (hole_id, from_slot, answered_day) where answered_day is not null;
alter table public.house_questions enable row level security;
revoke all on public.house_questions from public, anon, authenticated;

create or replace function public.wh_hq_add(p_kind text, p_question text, p_options jsonb, p_answer int) returns uuid
language plpgsql security definer set search_path = public as $$
declare m members; v_opts jsonb; v_n int; v_q text := btrim(coalesce(p_question, '')); v_id uuid;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if char_length(v_q) < 3 or char_length(v_q) > 200 then raise exception 'bad_question'; end if;
  if p_kind = 'yesno' then
    v_opts := '["Yes","No"]'::jsonb;
  elsif p_kind = 'choice' then
    if jsonb_typeof(p_options) <> 'array' then raise exception 'bad_options'; end if;
    select coalesce(jsonb_agg(left(btrim(v), 80) order by o), '[]'::jsonb) into v_opts
      from jsonb_array_elements_text(p_options) with ordinality t(v, o) where btrim(v) <> '';
    if jsonb_array_length(p_options) <> jsonb_array_length(v_opts) then raise exception 'bad_options'; end if;
  else
    raise exception 'bad_kind';
  end if;
  v_n := jsonb_array_length(v_opts);
  if v_n < 2 or v_n > 4 then raise exception 'bad_options'; end if;
  if p_answer is null or p_answer < 0 or p_answer >= v_n then raise exception 'bad_answer'; end if;
  if (select count(*) from house_questions where hole_id = m.hole_id and from_slot = m.slot and answered_at is null) >= 200 then
    raise exception 'too_many';
  end if;
  insert into house_questions (hole_id, from_slot, kind, question, options, answer)
  values (m.hole_id, m.slot, p_kind, v_q, v_opts, p_answer) returning id into v_id;
  return v_id;
end $$;

-- take back one of your questions before it's answered
create or replace function public.wh_hq_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  delete from house_questions where id = p_id and hole_id = m.hole_id and from_slot = m.slot and answered_at is null;
end $$;

-- Everything the House page needs. Their open questions come without the answer.
create or replace function public.wh_hq_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; v_today date; v_done boolean; v_next jsonb;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  v_today := wh_today(m.hole_id);
  select exists (select 1 from house_questions where hole_id = m.hole_id and from_slot = 1 - m.slot and answered_day = v_today) into v_done;
  if not v_done then
    select jsonb_build_object('id', id, 'kind', kind, 'question', question, 'options', options, 'created_at', created_at)
      into v_next from house_questions
     where hole_id = m.hole_id and from_slot = 1 - m.slot and answered_at is null
     order by created_at limit 1;
  end if;
  return jsonb_build_object(
    'today', v_today,
    'pieces', (select count(*) from house_questions where hole_id = m.hole_id and correct),
    'answered_today', v_done,
    'today_answer', (select jsonb_build_object('id', id, 'question', question, 'options', options, 'answer', answer, 'picked', picked, 'correct', correct)
                       from house_questions where hole_id = m.hole_id and from_slot = 1 - m.slot and answered_day = v_today),
    'next', v_next,
    'waiting', (select count(*) from house_questions where hole_id = m.hole_id and from_slot = 1 - m.slot and answered_at is null),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'question', question, 'options', options, 'answer', answer,
                       'picked', picked, 'correct', correct, 'answered_at', answered_at, 'created_at', created_at) order by created_at desc)
                       from (select * from house_questions where hole_id = m.hole_id and from_slot = m.slot order by created_at desc limit 200) q), '[]'),
    'theirs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'question', question, 'options', options, 'answer', answer,
                       'picked', picked, 'correct', correct, 'answered_at', answered_at) order by answered_at desc)
                       from (select * from house_questions where hole_id = m.hole_id and from_slot = 1 - m.slot and answered_at is not null order by answered_at desc limit 100) q), '[]')
  );
end $$;

-- answer one of theirs: once a day, checked here
create or replace function public.wh_hq_answer(p_id uuid, p_pick int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; q house_questions; v_today date;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  v_today := wh_today(m.hole_id);
  select * into q from house_questions where id = p_id and hole_id = m.hole_id for update;
  if not found then raise exception 'not_found'; end if;
  if q.from_slot = m.slot then raise exception 'own_question'; end if;
  if q.answered_at is not null then raise exception 'already_answered'; end if;
  if exists (select 1 from house_questions where hole_id = m.hole_id and from_slot = q.from_slot and answered_day = v_today) then
    raise exception 'one_a_day';
  end if;
  if p_pick is null or p_pick < 0 or p_pick >= jsonb_array_length(q.options) then raise exception 'bad_pick'; end if;
  update house_questions set answered_at = now(), answered_day = v_today, picked = p_pick, correct = (p_pick = q.answer)
   where id = q.id returning * into q;
  return jsonb_build_object('correct', q.correct, 'answer', q.answer, 'picked', q.picked,
    'pieces', (select count(*) from house_questions where hole_id = m.hole_id and correct));
end $$;

revoke execute on function public.wh_hq_add(text, text, jsonb, int), public.wh_hq_delete(uuid), public.wh_hq_state(), public.wh_hq_answer(uuid, int) from public, anon, authenticated;
grant execute on function public.wh_hq_add(text, text, jsonb, int), public.wh_hq_delete(uuid), public.wh_hq_state(), public.wh_hq_answer(uuid, int) to authenticated;

-- ── Design Tinder: five design and architecture cards a day, swiped by both ──
-- The deck itself lives in the app (src/design/deck.txt). Here: the day the deck started
-- for a pocket (so both phones deal the same five cards on the same day) and who swiped what.
-- A swipe is a score: 1 like, 2 love, 3 adore, -1 don't like, -2 dislike, -3 hate (how far you swiped).
-- Your person's swipe on a card stays hidden until you've swiped that card yourself.

create table if not exists public.design_decks (
  hole_id  uuid primary key references public.holes(id) on delete cascade,
  started  date not null
);
alter table public.design_decks enable row level security;
revoke all on public.design_decks from public, anon, authenticated;

create table if not exists public.design_swipes (
  hole_id    uuid not null references public.holes(id) on delete cascade,
  slot       smallint not null check (slot in (0, 1)),
  item       text not null check (item ~ '^[a-z0-9-]{1,64}$'),
  day        date not null,
  score      smallint not null check (score in (-3, -2, -1, 1, 2, 3)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hole_id, slot, item)
);
create index if not exists design_swipes_hole on public.design_swipes (hole_id, item);
alter table public.design_swipes enable row level security;
revoke all on public.design_swipes from public, anon, authenticated;

-- One card, rated -3..3 (not 0). Swiping it again changes your mind (the day it was dealt stays).
-- Returns their score on it too, if they've made one: you've just earned the right to see it.
create or replace function public.wh_ds_swipe(p_item text, p_day date, p_score int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; v_theirs smallint;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if p_item is null or p_item !~ '^[a-z0-9-]{1,64}$' then raise exception 'bad_item'; end if;
  if p_score is null or p_score not in (-3, -2, -1, 1, 2, 3) then raise exception 'bad_swipe'; end if;
  if p_day is null or p_day > wh_today(m.hole_id) + 1 or p_day < date '2026-01-01' then raise exception 'bad_day'; end if;
  insert into design_swipes (hole_id, slot, item, day, score) values (m.hole_id, m.slot, p_item, p_day, p_score)
  on conflict (hole_id, slot, item) do update set score = excluded.score, updated_at = now();
  select score into v_theirs from design_swipes where hole_id = m.hole_id and slot = 1 - m.slot and item = p_item;
  return jsonb_build_object('item', p_item, 'score', p_score, 'theirs', v_theirs);
end $$;

-- Take back your swipe on a card (the rewind button). Theirs is untouched.
create or replace function public.wh_ds_undo(p_item text) returns void
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  delete from design_swipes where hole_id = m.hole_id and slot = m.slot and item = p_item;
end $$;

-- Everything the Design page needs. The first call for a pocket starts its deck today.
-- theirs = their swipes on cards you've swiped too; pending = cards they've swiped
-- that you haven't (just the ids, never which way).
create or replace function public.wh_ds_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; v_today date; v_start date;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  v_today := wh_today(m.hole_id);
  insert into design_decks (hole_id, started) values (m.hole_id, v_today) on conflict (hole_id) do nothing;
  select started into v_start from design_decks where hole_id = m.hole_id;
  return jsonb_build_object(
    'today', v_today,
    'started', v_start,
    'mine', coalesce((select jsonb_agg(jsonb_build_object('item', s.item, 'day', s.day, 'score', s.score, 'at', s.updated_at) order by s.created_at)
                        from design_swipes s where s.hole_id = m.hole_id and s.slot = m.slot), '[]'),
    'theirs', coalesce((select jsonb_agg(jsonb_build_object('item', t.item, 'day', t.day, 'score', t.score, 'at', t.updated_at) order by t.created_at)
                        from design_swipes t
                        where t.hole_id = m.hole_id and t.slot = 1 - m.slot
                          and exists (select 1 from design_swipes y where y.hole_id = t.hole_id and y.slot = m.slot and y.item = t.item)), '[]'),
    'pending', coalesce((select jsonb_agg(t.item order by t.created_at)
                        from design_swipes t
                        where t.hole_id = m.hole_id and t.slot = 1 - m.slot
                          and not exists (select 1 from design_swipes y where y.hole_id = t.hole_id and y.slot = m.slot and y.item = t.item)), '[]')
  );
end $$;

revoke execute on function public.wh_ds_swipe(text, date, int), public.wh_ds_undo(text), public.wh_ds_state() from public, anon, authenticated;
grant execute on function public.wh_ds_swipe(text, date, int), public.wh_ds_undo(text), public.wh_ds_state() to authenticated;

-- ── Five Letters: a five-letter word a day, the same one for both of you ──
-- The word is the New York Times' Wordle answer from two days before (Manu, Nov 13). fl_words holds
-- those answers, one row per NYT date, shared by every pocket; a GitHub job (supabase/words.sh) fills
-- it twice a day from a public list of NYT answers, and the words function (supabase/functions/words)
-- fetches a missing one on demand. A pocket locks in its word for the day the first time either of you
-- opens the game, so you always play the same one. If the NYT word isn't in yet, the app sends a word
-- from its own list, picked by the date (the same on both phones), and that one is locked in.
-- A day can also have extra words (rounds 2, 3...), declared in fl_bonus (Manu, Nov 13: "let us play
-- one extra game today"). Round 1 is the daily word.
-- Guesses are checked on the phone (it has the word); here they're kept, one row per person per word.
-- Your person's guesses stay hidden until you've finished yours: the server only hands them over then.

create table if not exists public.fl_words (
  day        date primary key,
  word       text not null check (word ~ '^[a-z]{5}$'),
  fetched_at timestamptz not null default now()
);
alter table public.fl_words enable row level security;
revoke all on public.fl_words from public, anon, authenticated;

create table if not exists public.fl_days (
  hole_id  uuid not null references public.holes(id) on delete cascade,
  day      date not null,
  round    smallint not null default 1 constraint fl_days_round_check check (round between 1 and 9),
  word     text not null check (word ~ '^[a-z]{5}$'),
  nyt_day  date, -- the NYT puzzle it came from; null = a word from the app's own list
  primary key (hole_id, day, round)
);
alter table public.fl_days enable row level security;
revoke all on public.fl_days from public, anon, authenticated;

create table if not exists public.fl_games (
  hole_id    uuid not null,
  slot       smallint not null check (slot in (0, 1)),
  day        date not null,
  round      smallint not null default 1,
  guesses    text[] not null default '{}' check (cardinality(guesses) <= 6),
  solved     boolean not null default false,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hole_id, slot, day, round),
  constraint fl_games_round_fkey foreign key (hole_id, day, round) references public.fl_days (hole_id, day, round) on delete cascade
);
alter table public.fl_games enable row level security;
revoke all on public.fl_games from public, anon, authenticated;

-- from the first version (one word a day, keyed by day): add the round to both keys (015 → 016)
alter table public.fl_days add column if not exists round smallint not null default 1;
alter table public.fl_games add column if not exists round smallint not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.fl_days'::regclass and contype = 'p'
                 and pg_get_constraintdef(oid) like '%round%') then
    alter table public.fl_games drop constraint if exists fl_games_hole_id_day_fkey;
    alter table public.fl_games drop constraint if exists fl_games_pkey;
    alter table public.fl_days drop constraint if exists fl_days_pkey;
    alter table public.fl_days add primary key (hole_id, day, round);
    alter table public.fl_games add primary key (hole_id, slot, day, round);
    alter table public.fl_games add constraint fl_games_round_fkey foreign key (hole_id, day, round)
      references public.fl_days (hole_id, day, round) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fl_days_round_check') then
    alter table public.fl_days add constraint fl_days_round_check check (round between 1 and 9);
  end if;
end $$;

-- Extra words: each row gives a day a round 2, 3...: the NYT answer from nyt_day. It's locked in for a
-- pocket the first time it opens the game that day, once that answer is in fl_words. hole_id null =
-- every pocket. Rows are added by a migration (016 gave Nov 13, 2026 a round 2).
create table if not exists public.fl_bonus (
  day      date not null,
  round    smallint not null check (round between 2 and 9),
  nyt_day  date not null,
  hole_id  uuid references public.holes(id) on delete cascade
);
create unique index if not exists fl_bonus_key on public.fl_bonus (day, round, coalesce(hole_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.fl_bonus enable row level security;
revoke all on public.fl_bonus from public, anon, authenticated;

-- one person's game as the app sees it; p_full = false leaves out the guesses (just how far they got)
create or replace function public.wh_fl_game(g public.fl_games, p_full boolean) returns jsonb
language sql immutable set search_path = public as $$
  select case when g.hole_id is null then null
    else jsonb_build_object('n', cardinality(g.guesses), 'solved', g.solved, 'done', g.done, 'at', g.updated_at)
      || case when p_full then jsonb_build_object('guesses', to_jsonb(g.guesses)) else '{}'::jsonb end
  end
$$;

-- Everything Five Letters needs: today's word (locked in for the pocket on the first call), your game,
-- theirs (their guesses only once you're done), today's extra words (`extra`, same shape plus round),
-- and every earlier word for the stats (`days`, each with its round).
-- No NYT word yet and no p_fallback → word is null; the app asks the words function, then calls again.
-- Earlier days: their guesses show once you've finished that word, or once it can't be played any more
-- (yesterday stays open only to finish a game you started before midnight).
create or replace function public.wh_fl_state(p_fallback text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; v_today date; d fl_days; mine fl_games; theirs fl_games;
  v_fb text := lower(trim(coalesce(p_fallback, '')));
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  v_today := wh_today(m.hole_id);
  select * into d from fl_days where hole_id = m.hole_id and day = v_today and round = 1;
  if not found then
    insert into fl_days (hole_id, day, round, word, nyt_day)
      select m.hole_id, v_today, 1, w.word, w.day from fl_words w where w.day = v_today - 2
    on conflict do nothing;
    if not found and v_fb ~ '^[a-z]{5}$' then
      insert into fl_days (hole_id, day, round, word, nyt_day) values (m.hole_id, v_today, 1, v_fb, null) on conflict do nothing;
    end if;
    select * into d from fl_days where hole_id = m.hole_id and day = v_today and round = 1;
  end if;
  -- today's extra words, once their NYT answers are in
  insert into fl_days (hole_id, day, round, word, nyt_day)
    select m.hole_id, v_today, b.round, w.word, w.day
    from fl_bonus b join fl_words w on w.day = b.nyt_day
    where b.day = v_today and (b.hole_id is null or b.hole_id = m.hole_id)
  on conflict do nothing;
  select * into mine from fl_games where hole_id = m.hole_id and slot = m.slot and day = v_today and round = 1;
  select * into theirs from fl_games where hole_id = m.hole_id and slot = 1 - m.slot and day = v_today and round = 1;
  return jsonb_build_object(
    'today', v_today,
    'nyt_day', v_today - 2,
    'word', d.word,
    'nyt', d.nyt_day,
    'mine', wh_fl_game(mine, true),
    'theirs', wh_fl_game(theirs, coalesce(mine.done, false)),
    'extra', coalesce((
      select jsonb_agg(jsonb_build_object('round', x.round, 'word', x.word, 'nyt', x.nyt_day,
               'mine', wh_fl_game(a, true), 'theirs', wh_fl_game(b, coalesce(a.done, false)))
             order by x.round)
      from fl_days x
      left join fl_games a on a.hole_id = x.hole_id and a.day = x.day and a.round = x.round and a.slot = m.slot
      left join fl_games b on b.hole_id = x.hole_id and b.day = x.day and b.round = x.round and b.slot = 1 - m.slot
      where x.hole_id = m.hole_id and x.day = v_today and x.round > 1), '[]'),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.day, 'round', x.round, 'word', x.word, 'nyt', x.nyt_day,
               'mine', wh_fl_game(a, true),
               'theirs', wh_fl_game(b, coalesce(a.done, false) or x.day < v_today - 1 or a.hole_id is null))
             order by x.day desc, x.round)
      from (select * from fl_days where hole_id = m.hole_id and day < v_today order by day desc, round limit 400) x
      left join fl_games a on a.hole_id = x.hole_id and a.day = x.day and a.round = x.round and a.slot = m.slot
      left join fl_games b on b.hole_id = x.hole_id and b.day = x.day and b.round = x.round and b.slot = 1 - m.slot), '[]'));
end $$;

-- One guess. p_n says which one (1..6), so a guess sent again after a dropped connection isn't
-- saved twice. p_round: 1 = the day's word, 2+ = an extra word. Today's words, or yesterday's if you
-- started it before midnight. Returns your game and theirs (with their guesses once you've finished).
drop function if exists public.wh_fl_guess(date, int, text);
create or replace function public.wh_fl_guess(p_day date, p_n int, p_guess text, p_round int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; v_today date; d fl_days; g fl_games; t fl_games; v_n int;
  v_g text := lower(trim(coalesce(p_guess, ''))); v_r smallint := coalesce(p_round, 1);
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if v_g !~ '^[a-z]{5}$' then raise exception 'bad_guess'; end if;
  v_today := wh_today(m.hole_id);
  select * into d from fl_days where hole_id = m.hole_id and day = p_day and round = v_r;
  if not found then raise exception 'no_word'; end if;
  insert into fl_games (hole_id, slot, day, round) values (m.hole_id, m.slot, p_day, v_r) on conflict do nothing;
  select * into g from fl_games where hole_id = m.hole_id and slot = m.slot and day = p_day and round = v_r for update;
  v_n := cardinality(g.guesses);
  if not (p_n = v_n and v_n > 0 and g.guesses[v_n] = v_g) then -- else: already saved, a retry
    if p_day <> v_today and not (p_day = v_today - 1 and v_n > 0) then raise exception 'bad_day'; end if;
    if g.done then raise exception 'done'; end if;
    if p_n is distinct from v_n + 1 then raise exception 'out_of_order'; end if;
    update fl_games set guesses = guesses || v_g, solved = (v_g = d.word), done = (v_g = d.word or v_n + 1 >= 6), updated_at = now()
      where hole_id = m.hole_id and slot = m.slot and day = p_day and round = v_r
      returning * into g;
  end if;
  select * into t from fl_games where hole_id = m.hole_id and slot = 1 - m.slot and day = p_day and round = v_r;
  return jsonb_build_object('day', p_day, 'round', v_r, 'mine', wh_fl_game(g, true), 'theirs', wh_fl_game(t, g.done));
end $$;

revoke execute on function public.wh_fl_game(public.fl_games, boolean), public.wh_fl_state(text), public.wh_fl_guess(date, int, text, int) from public, anon, authenticated;
grant execute on function public.wh_fl_state(text), public.wh_fl_guess(date, int, text, int) to authenticated;

-- ── row level security ──────────────────────────────────────

alter table public.holes   enable row level security;
alter table public.members enable row level security;
alter table public.events  enable row level security;
alter table public.media   enable row level security;
alter table public.dailies enable row level security;
alter table public.planted enable row level security;
alter table public.sealed  enable row level security;

drop policy if exists wh_holes_read   on public.holes;
drop policy if exists wh_members_read on public.members;
drop policy if exists wh_events_read  on public.events;
drop policy if exists wh_media_read   on public.media;
drop policy if exists wh_dailies_read on public.dailies;

create policy wh_holes_read   on public.holes   for select to authenticated using (id = public.wh_hole());
create policy wh_members_read on public.members for select to authenticated using (hole_id = public.wh_hole());
create policy wh_events_read  on public.events  for select to authenticated using (hole_id = public.wh_hole());
create policy wh_media_read   on public.media   for select to authenticated using (hole_id = public.wh_hole());
create policy wh_dailies_read on public.dailies for select to authenticated using (hole_id = public.wh_hole() and slot = public.wh_slot());

revoke insert, update, delete on public.holes, public.members, public.events, public.media, public.dailies from anon, authenticated;
revoke all on public.holes, public.members, public.events, public.media, public.dailies from anon;
revoke all on public.planted from public, anon, authenticated;
revoke all on public.sealed  from public, anon, authenticated;
grant select on public.holes, public.members, public.events, public.media, public.dailies to authenticated;

revoke execute on function
  public.wh_create(text, jsonb, jsonb), public.wh_join(text, text, jsonb, jsonb), public.wh_reclaim(text, smallint),
  public.wh_leave(), public.wh_update_me(jsonb), public.wh_drop_push(smallint),
  public.wh_act(text, jsonb, text, text), public.wh_open(bigint, boolean), public.wh_set_reunion(date, text),
  public.wh_daily(date, text, text, text, text), public.wh_dailies(int),
  public.wh_retunnel(uuid), public.wh_dig_km(uuid, smallint, double precision), public.wh_code(),
  public.wh_today(uuid), public.wh_plant(text), public.wh_unplant(date), public.wh_planted(),
  public.wh_stats(timestamptz, timestamptz), public.wh_seal(jsonb, jsonb, text, text), public.wh_unseal(bigint),
  public.wh_media_ref(public.members, text), public.wh_reseed(uuid)
from public, anon, authenticated;

grant execute on function
  public.wh_create(text, jsonb, jsonb), public.wh_join(text, text, jsonb, jsonb), public.wh_reclaim(text, smallint),
  public.wh_leave(), public.wh_update_me(jsonb), public.wh_drop_push(smallint),
  public.wh_act(text, jsonb, text, text), public.wh_open(bigint, boolean), public.wh_set_reunion(date, text),
  public.wh_daily(date, text, text, text, text), public.wh_dailies(int),
  public.wh_plant(text), public.wh_unplant(date), public.wh_planted(), public.wh_stats(timestamptz, timestamptz),
  public.wh_seal(jsonb, jsonb, text, text), public.wh_unseal(bigint)
to authenticated;

-- ── push keys, generated by the nudge function on first use ──
-- Lives outside the API: only the database owner (the edge function) can read it.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.vapid (
  id          int primary key default 1 check (id = 1),
  public_key  text not null,
  private_key text not null,
  created_at  timestamptz not null default now()
);
revoke all on private.vapid from public, anon, authenticated;

-- ── realtime ────────────────────────────────────────────────

do $$
begin
  begin alter publication supabase_realtime add table public.events;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.members; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.holes;   exception when duplicate_object then null; end;
end $$;
