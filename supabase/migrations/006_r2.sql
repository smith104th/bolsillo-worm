-- 006: photos and whispers move to Cloudflare R2.
-- New files go up through the `media` edge function, which makes the media row
-- (key in `r2`, no bytes in `data`) and hands back its id. The app then passes
-- "media:<id>" to wh_act / wh_daily instead of the base64 bytes. Old rows keep
-- their bytes until the media function moves them, so nothing breaks in between.
-- Applied by .github/workflows/supabase.yml (supabase/migrate.sh).

alter table public.media alter column data drop not null;
alter table public.media add column if not exists r2 text;
alter table public.media add column if not exists bytes int;
alter table public.media add column if not exists slot smallint;

create or replace function public.wh_media_ref(m public.members, p_ref text) returns bigint
language plpgsql security definer set search_path = public as $$
declare mid bigint;
begin
  if p_ref !~ '^media:[0-9]{1,18}$' then raise exception 'bad_media'; end if;
  mid := substr(p_ref, 7)::bigint;
  perform 1 from media x where x.id = mid and x.hole_id = m.hole_id and x.slot = m.slot and x.r2 is not null
    and not exists (select 1 from events e where e.media_id = mid)
    and not exists (select 1 from dailies d where d.photo = mid);
  if not found then raise exception 'bad_media'; end if;
  return mid;
end $$;

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
    if p_media like 'media:%' then
      mid := wh_media_ref(m, p_media);
    elsif p_media is not null then
      if length(p_media) > 2500000 then raise exception 'too_big'; end if;
      insert into media (hole_id, mime, data, slot)
      values (m.hole_id, coalesce(p_mime, 'application/octet-stream'), p_media, m.slot) returning id into mid;
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
    part := 'photo';
    fresh := d.photographed_at is null;
    if p_photo like 'media:%' then
      mid := wh_media_ref(m, p_photo);
    else
      if length(p_photo) > 2500000 then raise exception 'too_big'; end if;
      insert into media (hole_id, mime, data, slot) values (m.hole_id, coalesce(p_mime, 'image/jpeg'), p_photo, m.slot) returning id into mid;
    end if;
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

revoke execute on function public.wh_media_ref(public.members, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
