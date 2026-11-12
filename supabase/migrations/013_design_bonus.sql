-- Nov 12: five extra Design Tinder cards today, for both of you (Manu: "just for today, as a little treat").
-- Moving the deck's start back one day deals tomorrow's five today; this morning's five count as
-- yesterday's and stay in the pile for whoever hasn't swiped them yet. From tomorrow it's five a day
-- again (the deck runs one day ahead). Data only, runs once (supabase/migrate.sh records it).
update public.design_decks set started = started - 1 where started = date '2026-11-12';
