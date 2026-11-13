-- Nov 13: Vio meant to put the Lloyd's building (Design Tinder card `lloyds`) at Love (2). Manu asked
-- for it to be changed and pushed. Data only, runs once (supabase/migrate.sh records it). It changes
-- nothing and fails the deploy job unless exactly one swipe is updated, so a green job means it worked.
do $$
declare n int;
begin
  update public.design_swipes s set score = 2, updated_at = now()
  from public.members m
  where s.item = 'lloyds' and m.hole_id = s.hole_id and m.slot = s.slot and m.name ~* '^\s*vio';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected to change one swipe (Vio on lloyds), would change %', n; end if;
end $$;
