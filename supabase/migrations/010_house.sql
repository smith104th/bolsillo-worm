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

notify pgrst, 'reload schema';
