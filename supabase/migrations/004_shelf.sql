-- Shelf: sealed open-when envelopes and date-locked capsules. Safe to run more than once.

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

alter table public.sealed enable row level security;
revoke all on public.sealed from public, anon, authenticated;

revoke execute on function public.wh_seal(jsonb, jsonb, text, text), public.wh_unseal(bigint) from public, anon;
grant execute on function public.wh_seal(jsonb, jsonb, text, text), public.wh_unseal(bigint) to authenticated;
