-- Dig: planted questions and year stats. Safe to run more than once.

-- ── seeds: questions you plant for each other ──────────────
-- A planted question takes the place of the daily one on the next free day.
-- Hidden from your partner until it comes up.

create table if not exists public.planted (
  hole_id     uuid not null references public.holes(id) on delete cascade,
  day         date not null,
  from_slot   smallint not null check (from_slot in (0, 1)),
  question    text not null check (char_length(question) between 3 and 200),
  created_at  timestamptz not null default now(),
  primary key (hole_id, day)
);

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

create or replace function public.wh_plant(p_question text) returns date
language plpgsql security definer set search_path = public as $$
declare m members; q text := btrim(coalesce(p_question, '')); d date;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if char_length(q) < 3 or char_length(q) > 200 then raise exception 'bad_question'; end if;
  if (select count(*) from planted p where p.hole_id = m.hole_id and p.from_slot = m.slot and p.day > wh_today(m.hole_id)) >= 7 then
    raise exception 'too_many_seeds';
  end if;
  d := wh_today(m.hole_id) + 1;
  loop
    begin
      insert into planted (hole_id, day, from_slot, question) values (m.hole_id, d, m.slot, q);
      exit;
    exception when unique_violation then
      d := d + 1;
    end;
  end loop;
  insert into events (hole_id, from_slot, kind, payload) values (m.hole_id, m.slot, 'plant', jsonb_build_object('day', d));
  perform wh_dig_km(m.hole_id, m.slot, 20);
  return d;
end $$;

-- dig a seed back up before it comes up
create or replace function public.wh_unplant(p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  delete from planted p where p.hole_id = m.hole_id and p.day = p_day and p.from_slot = m.slot and p.day > wh_today(m.hole_id);
  delete from events e where e.hole_id = m.hole_id and e.kind = 'plant' and e.from_slot = m.slot and e.payload->>'day' = p_day::text;
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

alter table public.planted enable row level security;
revoke all on public.planted from public, anon, authenticated;

revoke execute on function
  public.wh_today(uuid), public.wh_plant(text), public.wh_unplant(date), public.wh_planted(),
  public.wh_stats(timestamptz, timestamptz)
from public, anon;

grant execute on function
  public.wh_plant(text), public.wh_unplant(date), public.wh_planted(), public.wh_stats(timestamptz, timestamptz)
to authenticated;
