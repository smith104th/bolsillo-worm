-- Run by .github/workflows/restore-test.yml against the throwaway restored database (never live).
-- :lo = "<pockets>,<members>" that live had before the backup's day.
\set ON_ERROR_STOP on
select set_config('rt.lo', :'lo', false) \g /dev/null
do $$
declare lo text[] := string_to_array(current_setting('rt.lo'), ','); n int;
begin
  select count(*) into n from public.holes;
  if n < lo[1]::int then raise exception 'restored % pockets, live had % before the backup', n, lo[1]; end if;
  select count(*) into n from public.members;
  if n < lo[2]::int then raise exception 'restored % members, live had % before the backup', n, lo[2]; end if;
  if (select count(*) from public.members m where not exists (select 1 from auth.users u where u.id = m.user_id)) > 0
    then raise exception 'members without their sign-in'; end if;
  if (select count(*) from public.events) = 0 then raise exception 'no events'; end if;
  if (select count(*) from public.dailies) = 0 then raise exception 'no dailies'; end if;
  raise notice 'pockets, members, sign-ins and events are there';
end $$;

-- the app's own functions answer, as each member of the pocket with the most events
create temp table rt_out (who text, dailies int, design int, art int, events int);
grant all on rt_out to authenticated;
do $$
declare r record;
begin
  for r in select m.user_id, m.name from public.members m
           where m.hole_id = (select hole_id from public.events group by 1 order by count(*) desc limit 1) loop
    perform set_config('request.jwt.claim.sub', r.user_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into rt_out values (r.name,
      (select count(*) from public.wh_dailies(400)),
      jsonb_array_length(public.wh_ds_state() -> 'mine'),
      jsonb_array_length(public.wh_as_state() -> 'mine'),
      (select count(*) from public.events));
    execute 'reset role';
  end loop;
end $$;
select format('as %s: %s days of dailies, %s design swipes, %s art swipes, %s events visible', who, dailies, design, art, events) from rt_out;
do $$ begin
  if (select count(*) from rt_out) < 2 or exists (select 1 from rt_out where dailies = 0 or events = 0)
    then raise exception 'the restored app does not answer for both of you'; end if;
end $$;
