-- The Dial (Manu, Nov 16): a scale like "Cold to Hot", a target hidden somewhere on it, one clue.
-- Same as "The Dial" section of schema.sql. Re-runnable. New table and functions only; nothing existing changes.
-- ── The Dial: a scale, a hidden target on it, one clue ──
-- One of you (the giver) gets a scale and a target somewhere on it (0 to 1000, left to right) and gives
-- a clue; the other turns the dial to where they think the target is. The closer, the more points:
-- 4 in the middle of the target, 3 just beside it, 2 at its edges (each band is 5% of the dial wide).
-- You score together. Each of you can have one clue out at a time, so you can both be giving and
-- guessing at once. The target only leaves the server for the giver, or once the round is guessed.
-- The app picks the scale from its own list (src/dial.js) and sends it; the target is picked here.

create table if not exists public.dial_rounds (
  id         bigint generated always as identity primary key,
  hole_id    uuid not null references public.holes(id) on delete cascade,
  giver      smallint not null check (giver in (0, 1)),
  lo         text not null check (char_length(lo) between 1 and 40), -- the left end of the scale
  hi         text not null check (char_length(hi) between 1 and 40), -- the right end
  target     smallint not null check (target between 0 and 1000),
  clue       text check (char_length(clue) between 1 and 60),
  guess      smallint check (guess between 0 and 1000),
  points     smallint check (points in (0, 2, 3, 4)),
  created_at timestamptz not null default now(),
  clued_at   timestamptz,
  guessed_at timestamptz
);
create index if not exists dial_rounds_hole on public.dial_rounds (hole_id, id desc);
-- one round out per giver
create unique index if not exists dial_rounds_open on public.dial_rounds (hole_id, giver) where guessed_at is null;
alter table public.dial_rounds enable row level security;
revoke all on public.dial_rounds from public, anon, authenticated;

-- 4 within 2.5% of the target, 3 within 7.5%, 2 within 12.5%, else nothing
create or replace function public.wh_dial_points(p_target int, p_guess int) returns smallint
language sql immutable set search_path = public as $$
  select (case when abs(p_guess - p_target) <= 25 then 4
               when abs(p_guess - p_target) <= 75 then 3
               when abs(p_guess - p_target) <= 125 then 2 else 0 end)::smallint
$$;

-- a round as one of you sees it: the giver sees all of it. The guesser sees nothing until the clue is
-- in, then the scale and the clue, and the target once they've guessed.
create or replace function public.wh_dial_view(r public.dial_rounds, p_slot smallint) returns jsonb
language sql immutable set search_path = public as $$
  select case
    when r.id is null then null
    when r.giver <> p_slot and r.clued_at is null then jsonb_build_object('id', r.id, 'giver', r.giver, 'at', r.created_at)
    else jsonb_build_object('id', r.id, 'giver', r.giver, 'lo', r.lo, 'hi', r.hi, 'clue', r.clue,
      'target', case when r.giver = p_slot or r.guessed_at is not null then r.target end,
      'guess', r.guess, 'points', r.points, 'at', r.created_at, 'clued_at', r.clued_at, 'guessed_at', r.guessed_at)
  end
$$;

-- Everything the game needs: the round you're giving (if one is out), the one they're giving, the last
-- 300 finished rounds (newest first), and the totals over every round, per giver.
create or replace function public.wh_dial_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m members; mine dial_rounds; theirs dial_rounds;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  select * into mine from dial_rounds where hole_id = m.hole_id and giver = m.slot and guessed_at is null;
  select * into theirs from dial_rounds where hole_id = m.hole_id and giver = 1 - m.slot and guessed_at is null;
  return jsonb_build_object(
    'slot', m.slot,
    'mine', wh_dial_view(mine, m.slot),
    'theirs', wh_dial_view(theirs, m.slot),
    'past', coalesce((select jsonb_agg(x.v order by x.id desc) from (
        select r.id, wh_dial_view(r, m.slot) v from dial_rounds r
        where r.hole_id = m.hole_id and r.guessed_at is not null order by r.id desc limit 300) x), '[]'),
    'totals', coalesce((select jsonb_agg(jsonb_build_object('giver', t.giver, 'rounds', t.n, 'points', t.p, 'bulls', t.b) order by t.giver) from (
        select giver, count(*)::int n, sum(points)::int p, (count(*) filter (where points = 4))::int b
        from dial_rounds where hole_id = m.hole_id and guessed_at is not null group by giver) t), '[]'));
end $$;

-- Your turn to give: the round you have out, else a new one on this scale with a target picked here.
-- A round already dealt keeps its target and scale (calling again doesn't reroll it).
create or replace function public.wh_dial_deal(p_lo text, p_hi text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; r dial_rounds;
  v_lo text := btrim(coalesce(p_lo, '')); v_hi text := btrim(coalesce(p_hi, ''));
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  select * into r from dial_rounds where hole_id = m.hole_id and giver = m.slot and guessed_at is null;
  if found then return wh_dial_view(r, m.slot); end if;
  if char_length(v_lo) not between 1 and 40 or char_length(v_hi) not between 1 and 40 then raise exception 'bad_scale'; end if;
  insert into dial_rounds (hole_id, giver, lo, hi, target)
    values (m.hole_id, m.slot, v_lo, v_hi, (30 + floor(random() * 941))::smallint)
    on conflict (hole_id, giver) where guessed_at is null do nothing;
  select * into r from dial_rounds where hole_id = m.hole_id and giver = m.slot and guessed_at is null;
  return wh_dial_view(r, m.slot);
end $$;

-- Another scale for the round you're giving, before the clue goes out. The target stays where it is.
create or replace function public.wh_dial_card(p_id bigint, p_lo text, p_hi text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; r dial_rounds;
  v_lo text := btrim(coalesce(p_lo, '')); v_hi text := btrim(coalesce(p_hi, ''));
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if char_length(v_lo) not between 1 and 40 or char_length(v_hi) not between 1 and 40 then raise exception 'bad_scale'; end if;
  select * into r from dial_rounds where id = p_id and hole_id = m.hole_id and giver = m.slot and guessed_at is null for update;
  if not found then raise exception 'no_round'; end if;
  if r.clued_at is not null then raise exception 'clued'; end if;
  update dial_rounds set lo = v_lo, hi = v_hi where id = r.id returning * into r;
  return wh_dial_view(r, m.slot);
end $$;

-- Send the clue. Sending the same clue again (a retry after a dropped connection) is fine.
create or replace function public.wh_dial_clue(p_id bigint, p_clue text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; r dial_rounds;
  v_clue text := btrim(regexp_replace(coalesce(p_clue, ''), '\s+', ' ', 'g'));
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if char_length(v_clue) not between 1 and 60 then raise exception 'bad_clue'; end if;
  select * into r from dial_rounds where id = p_id and hole_id = m.hole_id and giver = m.slot for update;
  if not found then raise exception 'no_round'; end if;
  if r.clued_at is not null then
    if r.clue = v_clue then return wh_dial_view(r, m.slot); end if;
    raise exception 'clued';
  end if;
  update dial_rounds set clue = v_clue, clued_at = now() where id = r.id returning * into r;
  return wh_dial_view(r, m.slot);
end $$;

-- Turn the dial: your guess on their clue (0 to 1000). Returns the round with the target and the points.
-- The same guess sent again is fine.
create or replace function public.wh_dial_guess(p_id bigint, p_guess int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; r dial_rounds;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if p_guess is null or p_guess not between 0 and 1000 then raise exception 'bad_guess'; end if;
  select * into r from dial_rounds where id = p_id and hole_id = m.hole_id and giver <> m.slot for update;
  if not found then raise exception 'no_round'; end if;
  if r.clued_at is null then raise exception 'no_clue'; end if;
  if r.guessed_at is not null then
    if r.guess = p_guess then return wh_dial_view(r, m.slot); end if;
    raise exception 'guessed';
  end if;
  update dial_rounds set guess = p_guess, points = wh_dial_points(r.target, p_guess), guessed_at = now()
    where id = r.id returning * into r;
  return wh_dial_view(r, m.slot);
end $$;

revoke execute on function
  public.wh_dial_points(int, int), public.wh_dial_view(public.dial_rounds, smallint),
  public.wh_dial_state(), public.wh_dial_deal(text, text), public.wh_dial_card(bigint, text, text),
  public.wh_dial_clue(bigint, text), public.wh_dial_guess(bigint, int)
from public, anon, authenticated;
grant execute on function
  public.wh_dial_state(), public.wh_dial_deal(text, text), public.wh_dial_card(bigint, text, text),
  public.wh_dial_clue(bigint, text), public.wh_dial_guess(bigint, int)
to authenticated;

notify pgrst, 'reload schema';
