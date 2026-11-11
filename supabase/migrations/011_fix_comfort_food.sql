-- One-off fix (Manu, Nov 10): "What's my comfort food when I'm sick?" was saved with
-- Chicken Noodle as the right answer; Ajiaco (what Vio picked) is right. Count it.
do $$
declare n int;
begin
  update public.house_questions
     set answer = picked, correct = true
   where question ilike 'what_s my comfort food when i_m sick%'
     and picked is not null
     and options ->> picked::int = 'Ajiaco'
     and correct is not true;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'comfort food question not found'; end if;
  raise notice 'fixed % row(s)', n;
end $$;
