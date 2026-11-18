-- Nov 17: Manu asked to change Vio's answer to the Nov 16 question ("Dream blunt rotation, only people
-- that are alive. And you have to hate one of them.", planted by Manu). It was "Anya Taylor, Annie Lennox,
-- my COS". The time she answered stays. Data only, runs once (supabase/migrate.sh records it). It changes
-- nothing and fails the deploy job unless exactly one answer is updated, so a green job means it worked.
do $$
declare n int;
begin
  update public.dailies d set answer = 'Anna Khachiyan, Naomi Campbell, Courtney Love'
  from public.members m
  where d.day = date '2026-11-16' and d.answer is not null
    and m.hole_id = d.hole_id and m.slot = d.slot and m.name ~* '^\s*vio';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected to change one answer (Vio on Nov 16), would change %', n; end if;
end $$;
