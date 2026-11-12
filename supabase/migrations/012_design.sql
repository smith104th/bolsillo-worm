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

notify pgrst, 'reload schema';
