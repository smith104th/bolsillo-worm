-- Five Letters, extra words (Manu, Nov 13: "just for fun let us play one extra game today, make sure
-- this one stays in stats"). A day can now have more than one word: fl_days and fl_games get a round
-- (1 = the day's word) in their keys, fl_bonus declares the extra ones, wh_fl_state returns today's
-- extras, wh_fl_guess takes p_round (default 1, so older app versions keep working).
-- Today's extra word is the NYT answer from Nov 11, the one today's game would have used if the NYT
-- fetch had worked (today got a word from the app's own list instead).
-- Same as the "Five Letters" section of schema.sql, plus that one row of data. Re-runnable.
-- ── Five Letters: a five-letter word a day, the same one for both of you ──
-- The word is the New York Times' Wordle answer from two days before (Manu, Nov 13). fl_words holds
-- those answers, one row per NYT date, shared by every pocket; a GitHub job (supabase/words.sh) fills
-- it twice a day from a public list of NYT answers, and the words function (supabase/functions/words)
-- fetches a missing one on demand. A pocket locks in its word for the day the first time either of you
-- opens the game, so you always play the same one. If the NYT word isn't in yet, the app sends a word
-- from its own list, picked by the date (the same on both phones), and that one is locked in.
-- A day can also have extra words (rounds 2, 3...), declared in fl_bonus (Manu, Nov 13: "let us play
-- one extra game today"). Round 1 is the daily word.
-- Guesses are checked on the phone (it has the word); here they're kept, one row per person per word.
-- Your person's guesses stay hidden until you've finished yours: the server only hands them over then.

create table if not exists public.fl_words (
  day        date primary key,
  word       text not null check (word ~ '^[a-z]{5}$'),
  fetched_at timestamptz not null default now()
);
alter table public.fl_words enable row level security;
revoke all on public.fl_words from public, anon, authenticated;

create table if not exists public.fl_days (
  hole_id  uuid not null references public.holes(id) on delete cascade,
  day      date not null,
  round    smallint not null default 1 constraint fl_days_round_check check (round between 1 and 9),
  word     text not null check (word ~ '^[a-z]{5}$'),
  nyt_day  date, -- the NYT puzzle it came from; null = a word from the app's own list
  primary key (hole_id, day, round)
);
alter table public.fl_days enable row level security;
revoke all on public.fl_days from public, anon, authenticated;

create table if not exists public.fl_games (
  hole_id    uuid not null,
  slot       smallint not null check (slot in (0, 1)),
  day        date not null,
  round      smallint not null default 1,
  guesses    text[] not null default '{}' check (cardinality(guesses) <= 6),
  solved     boolean not null default false,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hole_id, slot, day, round),
  constraint fl_games_round_fkey foreign key (hole_id, day, round) references public.fl_days (hole_id, day, round) on delete cascade
);
alter table public.fl_games enable row level security;
revoke all on public.fl_games from public, anon, authenticated;

-- from the first version (one word a day, keyed by day): add the round to both keys (015 → 016)
alter table public.fl_days add column if not exists round smallint not null default 1;
alter table public.fl_games add column if not exists round smallint not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.fl_days'::regclass and contype = 'p'
                 and pg_get_constraintdef(oid) like '%round%') then
    alter table public.fl_games drop constraint if exists fl_games_hole_id_day_fkey;
    alter table public.fl_games drop constraint if exists fl_games_pkey;
    alter table public.fl_days drop constraint if exists fl_days_pkey;
    alter table public.fl_days add primary key (hole_id, day, round);
    alter table public.fl_games add primary key (hole_id, slot, day, round);
    alter table public.fl_games add constraint fl_games_round_fkey foreign key (hole_id, day, round)
      references public.fl_days (hole_id, day, round) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fl_days_round_check') then
    alter table public.fl_days add constraint fl_days_round_check check (round between 1 and 9);
  end if;
end $$;

-- Extra words: each row gives a day a round 2, 3...: the NYT answer from nyt_day. It's locked in for a
-- pocket the first time it opens the game that day, once that answer is in fl_words. hole_id null =
-- every pocket. Rows are added by a migration (016 gave Nov 13, 2026 a round 2).
create table if not exists public.fl_bonus (
  day      date not null,
  round    smallint not null check (round between 2 and 9),
  nyt_day  date not null,
  hole_id  uuid references public.holes(id) on delete cascade
);
create unique index if not exists fl_bonus_key on public.fl_bonus (day, round, coalesce(hole_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.fl_bonus enable row level security;
revoke all on public.fl_bonus from public, anon, authenticated;

-- one person's game as the app sees it; p_full = false leaves out the guesses (just how far they got)
create or replace function public.wh_fl_game(g public.fl_games, p_full boolean) returns jsonb
language sql immutable set search_path = public as $$
  select case when g.hole_id is null then null
    else jsonb_build_object('n', cardinality(g.guesses), 'solved', g.solved, 'done', g.done, 'at', g.updated_at)
      || case when p_full then jsonb_build_object('guesses', to_jsonb(g.guesses)) else '{}'::jsonb end
  end
$$;

-- Everything Five Letters needs: today's word (locked in for the pocket on the first call), your game,
-- theirs (their guesses only once you're done), today's extra words (`extra`, same shape plus round),
-- and every earlier word for the stats (`days`, each with its round).
-- No NYT word yet and no p_fallback → word is null; the app asks the words function, then calls again.
-- Earlier days: their guesses show once you've finished that word, or once it can't be played any more
-- (yesterday stays open only to finish a game you started before midnight).
create or replace function public.wh_fl_state(p_fallback text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; v_today date; d fl_days; mine fl_games; theirs fl_games;
  v_fb text := lower(trim(coalesce(p_fallback, '')));
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  v_today := wh_today(m.hole_id);
  select * into d from fl_days where hole_id = m.hole_id and day = v_today and round = 1;
  if not found then
    insert into fl_days (hole_id, day, round, word, nyt_day)
      select m.hole_id, v_today, 1, w.word, w.day from fl_words w where w.day = v_today - 2
    on conflict do nothing;
    if not found and v_fb ~ '^[a-z]{5}$' then
      insert into fl_days (hole_id, day, round, word, nyt_day) values (m.hole_id, v_today, 1, v_fb, null) on conflict do nothing;
    end if;
    select * into d from fl_days where hole_id = m.hole_id and day = v_today and round = 1;
  end if;
  -- today's extra words, once their NYT answers are in
  insert into fl_days (hole_id, day, round, word, nyt_day)
    select m.hole_id, v_today, b.round, w.word, w.day
    from fl_bonus b join fl_words w on w.day = b.nyt_day
    where b.day = v_today and (b.hole_id is null or b.hole_id = m.hole_id)
  on conflict do nothing;
  select * into mine from fl_games where hole_id = m.hole_id and slot = m.slot and day = v_today and round = 1;
  select * into theirs from fl_games where hole_id = m.hole_id and slot = 1 - m.slot and day = v_today and round = 1;
  return jsonb_build_object(
    'today', v_today,
    'nyt_day', v_today - 2,
    'word', d.word,
    'nyt', d.nyt_day,
    'mine', wh_fl_game(mine, true),
    'theirs', wh_fl_game(theirs, coalesce(mine.done, false)),
    'extra', coalesce((
      select jsonb_agg(jsonb_build_object('round', x.round, 'word', x.word, 'nyt', x.nyt_day,
               'mine', wh_fl_game(a, true), 'theirs', wh_fl_game(b, coalesce(a.done, false)))
             order by x.round)
      from fl_days x
      left join fl_games a on a.hole_id = x.hole_id and a.day = x.day and a.round = x.round and a.slot = m.slot
      left join fl_games b on b.hole_id = x.hole_id and b.day = x.day and b.round = x.round and b.slot = 1 - m.slot
      where x.hole_id = m.hole_id and x.day = v_today and x.round > 1), '[]'),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.day, 'round', x.round, 'word', x.word, 'nyt', x.nyt_day,
               'mine', wh_fl_game(a, true),
               'theirs', wh_fl_game(b, coalesce(a.done, false) or x.day < v_today - 1 or a.hole_id is null))
             order by x.day desc, x.round)
      from (select * from fl_days where hole_id = m.hole_id and day < v_today order by day desc, round limit 400) x
      left join fl_games a on a.hole_id = x.hole_id and a.day = x.day and a.round = x.round and a.slot = m.slot
      left join fl_games b on b.hole_id = x.hole_id and b.day = x.day and b.round = x.round and b.slot = 1 - m.slot), '[]'));
end $$;

-- One guess. p_n says which one (1..6), so a guess sent again after a dropped connection isn't
-- saved twice. p_round: 1 = the day's word, 2+ = an extra word. Today's words, or yesterday's if you
-- started it before midnight. Returns your game and theirs (with their guesses once you've finished).
drop function if exists public.wh_fl_guess(date, int, text);
create or replace function public.wh_fl_guess(p_day date, p_n int, p_guess text, p_round int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; v_today date; d fl_days; g fl_games; t fl_games; v_n int;
  v_g text := lower(trim(coalesce(p_guess, ''))); v_r smallint := coalesce(p_round, 1);
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if v_g !~ '^[a-z]{5}$' then raise exception 'bad_guess'; end if;
  v_today := wh_today(m.hole_id);
  select * into d from fl_days where hole_id = m.hole_id and day = p_day and round = v_r;
  if not found then raise exception 'no_word'; end if;
  insert into fl_games (hole_id, slot, day, round) values (m.hole_id, m.slot, p_day, v_r) on conflict do nothing;
  select * into g from fl_games where hole_id = m.hole_id and slot = m.slot and day = p_day and round = v_r for update;
  v_n := cardinality(g.guesses);
  if not (p_n = v_n and v_n > 0 and g.guesses[v_n] = v_g) then -- else: already saved, a retry
    if p_day <> v_today and not (p_day = v_today - 1 and v_n > 0) then raise exception 'bad_day'; end if;
    if g.done then raise exception 'done'; end if;
    if p_n is distinct from v_n + 1 then raise exception 'out_of_order'; end if;
    update fl_games set guesses = guesses || v_g, solved = (v_g = d.word), done = (v_g = d.word or v_n + 1 >= 6), updated_at = now()
      where hole_id = m.hole_id and slot = m.slot and day = p_day and round = v_r
      returning * into g;
  end if;
  select * into t from fl_games where hole_id = m.hole_id and slot = 1 - m.slot and day = p_day and round = v_r;
  return jsonb_build_object('day', p_day, 'round', v_r, 'mine', wh_fl_game(g, true), 'theirs', wh_fl_game(t, g.done));
end $$;

revoke execute on function public.wh_fl_game(public.fl_games, boolean), public.wh_fl_state(text), public.wh_fl_guess(date, int, text, int) from public, anon, authenticated;
grant execute on function public.wh_fl_state(text), public.wh_fl_guess(date, int, text, int) to authenticated;

-- today's extra word, for every pocket
insert into public.fl_bonus (day, round, nyt_day) values (date '2026-11-13', 2, date '2026-11-11') on conflict do nothing;

notify pgrst, 'reload schema';
