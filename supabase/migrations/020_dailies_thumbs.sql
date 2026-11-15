-- Nov 14: Today only needs today's photo previews (Manu: Today sat on "Digging…" on slow wifi; it was
-- downloading every day's previews each time it opened). wh_dailies gets p_thumb_days: only the newest
-- N days come with previews, null = every day (Soil, the zine and Save everything, and older apps that
-- don't send it). The phone keeps the older previews (src/dailies.js). Re-runnable.
drop function if exists public.wh_dailies(int);
create or replace function public.wh_dailies(p_limit int default 120, p_thumb_days int default null)
returns table (day date,
               my_answer text, their_answer text, their_answered boolean,
               my_photo bigint, my_thumb text, their_photo bigint, their_thumb text, their_photographed boolean)
language plpgsql stable security definer set search_path = public as $$
declare m members; t date;
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  t := wh_today(m.hole_id);
  return query
    select x.day,
      me.answer,
      case when me.answered_at is not null then th.answer end,
      th.answered_at is not null,
      me.photo, case when p_thumb_days is null or x.day > t - p_thumb_days then me.thumb end,
      case when me.photographed_at is not null then th.photo end,
      case when me.photographed_at is not null and (p_thumb_days is null or x.day > t - p_thumb_days) then th.thumb end,
      th.photographed_at is not null
    from (select distinct dd.day from dailies dd where dd.hole_id = m.hole_id) x
    left join dailies me on me.hole_id = m.hole_id and me.day = x.day and me.slot = m.slot
    left join dailies th on th.hole_id = m.hole_id and th.day = x.day and th.slot = 1 - m.slot
    order by x.day desc
    limit p_limit;
end $$;

revoke execute on function public.wh_dailies(int, int) from public, anon, authenticated;
grant execute on function public.wh_dailies(int, int) to authenticated;

notify pgrst, 'reload schema';
