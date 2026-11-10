-- Seeds alternate between the two of you (Manu, Nov 10). Safe to run more than once.

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

revoke execute on function public.wh_reseed(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
