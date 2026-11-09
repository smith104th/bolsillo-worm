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
  kept        boolean not null default false
);
create index if not exists events_hole_time on public.events (hole_id, created_at desc);

create table if not exists public.media (
  id          bigint generated always as identity primary key,
  hole_id     uuid not null references public.holes(id) on delete cascade,
  mime        text not null,
  data        text not null,
  created_at  timestamptz not null default now()
);
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
language sql immutable as $$
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

-- ── doing things to each other ──────────────────────────────

create or replace function public.wh_act(p_kind text, p_payload jsonb default '{}', p_media text default null, p_mime text default null)
returns public.events
language plpgsql security definer set search_path = public as $$
declare
  m members; e events; mid bigint; other smallint; km float8; lv int;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if p_kind not in ('pet','boop','kiss','feed','mist','note','doodle','photo','whisper','wiggle','trinket','knock','ring','touch') then
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
    if p_media is not null then
      if length(p_media) > 2500000 then raise exception 'too_big'; end if;
      insert into media (hole_id, mime, data)
      values (m.hole_id, coalesce(p_mime, 'application/octet-stream'), p_media) returning id into mid;
    end if;
    insert into events (hole_id, from_slot, kind, payload, media_id)
    values (m.hole_id, m.slot, p_kind, coalesce(p_payload, '{}'), mid) returning * into e;
  end if;

  km := case p_kind
    when 'pet' then 2 when 'boop' then 1 when 'feed' then 8 when 'mist' then 6
    when 'kiss' then 6 * least(5, greatest(1, coalesce((p_payload->>'level')::int, 1)))
    when 'note' then 40 when 'doodle' then 40 when 'photo' then 35 when 'whisper' then 45
    when 'wiggle' then 15 when 'trinket' then 20 when 'knock' then 4 when 'touch' then 60
    else 0 end;
  lv := case p_kind
    when 'pet' then 1 when 'boop' then 1 when 'feed' then 3 when 'mist' then 2
    when 'kiss' then 2 * least(5, greatest(1, coalesce((p_payload->>'level')::int, 1)))
    when 'touch' then 5 when 'knock' then 1 when 'ring' then 0 else 4 end;

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
  update holes set reunion_on = p_on, reunion_note = left(p_note, 80) where id = m.hole_id;
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
    if length(p_photo) > 2500000 then raise exception 'too_big'; end if;
    part := 'photo';
    fresh := d.photographed_at is null;
    insert into media (hole_id, mime, data) values (m.hole_id, coalesce(p_mime, 'image/jpeg'), p_photo) returning id into mid;
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

-- ── row level security ──────────────────────────────────────

alter table public.holes   enable row level security;
alter table public.members enable row level security;
alter table public.events  enable row level security;
alter table public.media   enable row level security;
alter table public.dailies enable row level security;

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
grant select on public.holes, public.members, public.events, public.media, public.dailies to authenticated;

revoke execute on function
  public.wh_create(text, jsonb, jsonb), public.wh_join(text, text, jsonb, jsonb), public.wh_reclaim(text, smallint),
  public.wh_leave(), public.wh_update_me(jsonb), public.wh_drop_push(smallint),
  public.wh_act(text, jsonb, text, text), public.wh_open(bigint, boolean), public.wh_set_reunion(date, text),
  public.wh_daily(date, text, text, text, text), public.wh_dailies(int),
  public.wh_retunnel(uuid), public.wh_dig_km(uuid, smallint, double precision), public.wh_code()
from public, anon;

grant execute on function
  public.wh_create(text, jsonb, jsonb), public.wh_join(text, text, jsonb, jsonb), public.wh_reclaim(text, smallint),
  public.wh_leave(), public.wh_update_me(jsonb), public.wh_drop_push(smallint),
  public.wh_act(text, jsonb, text, text), public.wh_open(bigint, boolean), public.wh_set_reunion(date, text),
  public.wh_daily(date, text, text, text, text), public.wh_dailies(int)
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
