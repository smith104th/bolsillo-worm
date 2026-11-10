-- When the current countdown started, for the progress bar on the Us card. Safe to run more than once.
alter table public.holes add column if not exists reunion_from date;

-- Countdowns already running: start them on the day they were set (the first 'reunion'
-- event for the current date, in the first worm's time zone), else the latest one.
update public.holes h set reunion_from = coalesce(
  (select min((e.created_at at time zone coalesce(nullif(m.place->>'tz', ''), 'UTC'))::date)
     from public.events e left join public.members m on m.hole_id = h.id and m.slot = 0
    where e.hole_id = h.id and e.kind = 'reunion' and e.payload->>'on' = h.reunion_on::text),
  (select max((e.created_at at time zone coalesce(nullif(m.place->>'tz', ''), 'UTC'))::date)
     from public.events e left join public.members m on m.hole_id = h.id and m.slot = 0
    where e.hole_id = h.id and e.kind = 'reunion'),
  (h.created_at at time zone 'UTC')::date)
where h.reunion_on is not null and h.reunion_from is null;

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

notify pgrst, 'reload schema';
