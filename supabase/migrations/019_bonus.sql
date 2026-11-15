-- Nov 14: five extra cards today in both Tinders, for both of you (Manu: "add 5 extra cards to both
-- tinders today for bonus"). Same as 013: moving a deck's start back one day deals tomorrow's cards
-- today, and today's earlier cards count as yesterday's (both of you had already swiped them).
-- Design Tinder: Nov 11 -> Nov 10. The app moves RETIRE_FROM to Nov 14 in the same push, so today's
-- five come from the deck without the retired cards (with only this, one of them would be retired).
-- Art Tinder: Nov 14 -> Nov 13. The first day's ten count as yesterday's; today deals cards 11 to 15.
-- Each deck runs out a day earlier. Data only, runs once (supabase/migrate.sh records it).
update public.design_decks set started = started - 1 where started = date '2026-11-11';
update public.art_decks set started = started - 1 where started = date '2026-11-14';
