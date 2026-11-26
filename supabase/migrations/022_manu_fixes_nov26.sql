-- Nov 26 (Manu asked): two data fixes. Runs once (supabase/migrate.sh records it). Each block
-- fails the deploy job unless exactly one row changes, so a green job means both worked.

-- 1. Garden & House: Manu's most recently answered question (one of Vio's) counts as right.
--    His pick becomes the right answer's index; the piece builds on next open.
do $$
declare n int;
begin
  with mine as (
    select q.id
    from public.house_questions q
    join public.members m on m.hole_id = q.hole_id and m.slot = q.from_slot
    where m.name ~* '^\s*vio' and q.answered_at is not null
    order by q.answered_at desc
    limit 1
  )
  update public.house_questions q
     set picked = q.answer, correct = true
    from mine
   where q.id = mine.id and q.correct is not true;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected to fix Manu''s latest house answer, would change %', n; end if;
end $$;

-- 2. Soil: Manu's answer to yesterday's question (Nov 25), which he missed.
do $$
declare n int;
begin
  insert into public.dailies (hole_id, day, slot, answer, answered_at)
  select m.hole_id, date '2026-11-25', m.slot,
         'Throwing away all my football shirts from when I was a kid.', now()
  from public.members m
  where m.name !~* '^\s*vio'
  on conflict (hole_id, day, slot) do update
     set answer = excluded.answer, answered_at = coalesce(public.dailies.answered_at, excluded.answered_at)
   where public.dailies.answer is null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected to add one answer (Manu on Nov 25), would change %', n; end if;
end $$;
