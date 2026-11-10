-- 005: songs. A song is a new thing you can drop into their pocket (it replaces
-- "found thing" in the Drop menu; old trinkets still read fine). wh_act accepts
-- kind 'song' and digs 30 km for it.

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
