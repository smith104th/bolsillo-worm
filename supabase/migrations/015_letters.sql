-- Five Letters (Manu, Nov 13): a five-letter word a day for the two of you, the New York Times'
-- Wordle answer from two days before. Same as the "Five Letters" section of schema.sql.
-- Re-runnable. New tables and functions only; nothing existing changes.
-- ── Five Letters: a five-letter word a day, the same one for both of you ──
-- The word is the New York Times' Wordle answer from two days before (Manu, Nov 13). The words
-- function (supabase/functions/words) fetches those into fl_words, one row per NYT date, shared by
-- every pocket. A pocket locks in its word for the day the first time either of you opens the game,
-- so you always play the same one. If the NYT word isn't in yet (the fetch failed), the app sends a
-- word from its own list, picked by the date (the same on both phones), and that one is locked in.
-- Guesses are checked on the phone (it has the word); here they're kept, one row per person a day.
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
  word     text not null check (word ~ '^[a-z]{5}$'),
  nyt_day  date, -- the NYT puzzle it came from; null = a word from the app's own list
  primary key (hole_id, day)
);
alter table public.fl_days enable row level security;
revoke all on public.fl_days from public, anon, authenticated;

create table if not exists public.fl_games (
  hole_id    uuid not null,
  slot       smallint not null check (slot in (0, 1)),
  day        date not null,
  guesses    text[] not null default '{}' check (cardinality(guesses) <= 6),
  solved     boolean not null default false,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hole_id, slot, day),
  foreign key (hole_id, day) references public.fl_days (hole_id, day) on delete cascade
);
alter table public.fl_games enable row level security;
revoke all on public.fl_games from public, anon, authenticated;

-- one person's game as the app sees it; p_full = false leaves out the guesses (just how far they got)
create or replace function public.wh_fl_game(g public.fl_games, p_full boolean) returns jsonb
language sql immutable set search_path = public as $$
  select case when g.hole_id is null then null
    else jsonb_build_object('n', cardinality(g.guesses), 'solved', g.solved, 'done', g.done, 'at', g.updated_at)
      || case when p_full then jsonb_build_object('guesses', to_jsonb(g.guesses)) else '{}'::jsonb end
  end
$$;

-- Everything Five Letters needs: today's word (locked in for the pocket on the first call), your game,
-- theirs (their guesses only once you're done), and every earlier day for the stats.
-- No NYT word yet and no p_fallback → word is null; the app asks the words function, then calls again.
-- Earlier days: their guesses show once you've finished that day, or once it can't be played any more
-- (yesterday stays open only to finish a game you started before midnight).
create or replace function public.wh_fl_state(p_fallback text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; v_today date; d fl_days; mine fl_games; theirs fl_games;
  v_fb text := lower(trim(coalesce(p_fallback, '')));
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  v_today := wh_today(m.hole_id);
  select * into d from fl_days where hole_id = m.hole_id and day = v_today;
  if not found then
    insert into fl_days (hole_id, day, word, nyt_day)
      select m.hole_id, v_today, w.word, w.day from fl_words w where w.day = v_today - 2
    on conflict do nothing;
    if not found and v_fb ~ '^[a-z]{5}$' then
      insert into fl_days (hole_id, day, word, nyt_day) values (m.hole_id, v_today, v_fb, null) on conflict do nothing;
    end if;
    select * into d from fl_days where hole_id = m.hole_id and day = v_today;
  end if;
  select * into mine from fl_games where hole_id = m.hole_id and slot = m.slot and day = v_today;
  select * into theirs from fl_games where hole_id = m.hole_id and slot = 1 - m.slot and day = v_today;
  return jsonb_build_object(
    'today', v_today,
    'nyt_day', v_today - 2,
    'word', d.word,
    'nyt', d.nyt_day,
    'mine', wh_fl_game(mine, true),
    'theirs', wh_fl_game(theirs, coalesce(mine.done, false)),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.day, 'word', x.word, 'nyt', x.nyt_day,
               'mine', wh_fl_game(a, true),
               'theirs', wh_fl_game(b, coalesce(a.done, false) or x.day < v_today - 1 or a.hole_id is null))
             order by x.day desc)
      from (select * from fl_days where hole_id = m.hole_id and day < v_today order by day desc limit 400) x
      left join fl_games a on a.hole_id = x.hole_id and a.day = x.day and a.slot = m.slot
      left join fl_games b on b.hole_id = x.hole_id and b.day = x.day and b.slot = 1 - m.slot), '[]'));
end $$;

-- One guess. p_n says which one (1..6), so a guess sent again after a dropped connection isn't
-- saved twice. Today's word, or yesterday's if you started it before midnight. Returns your game
-- and theirs (with their guesses once you've finished).
create or replace function public.wh_fl_guess(p_day date, p_n int, p_guess text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; v_today date; d fl_days; g fl_games; t fl_games; v_n int;
  v_g text := lower(trim(coalesce(p_guess, '')));
begin
  select * into m from members where user_id = auth.uid();
  if not found then raise exception 'no_hole'; end if;
  if v_g !~ '^[a-z]{5}$' then raise exception 'bad_guess'; end if;
  v_today := wh_today(m.hole_id);
  select * into d from fl_days where hole_id = m.hole_id and day = p_day;
  if not found then raise exception 'no_word'; end if;
  insert into fl_games (hole_id, slot, day) values (m.hole_id, m.slot, p_day) on conflict do nothing;
  select * into g from fl_games where hole_id = m.hole_id and slot = m.slot and day = p_day for update;
  v_n := cardinality(g.guesses);
  if not (p_n = v_n and v_n > 0 and g.guesses[v_n] = v_g) then -- else: already saved, a retry
    if p_day <> v_today and not (p_day = v_today - 1 and v_n > 0) then raise exception 'bad_day'; end if;
    if g.done then raise exception 'done'; end if;
    if p_n is distinct from v_n + 1 then raise exception 'out_of_order'; end if;
    update fl_games set guesses = guesses || v_g, solved = (v_g = d.word), done = (v_g = d.word or v_n + 1 >= 6), updated_at = now()
      where hole_id = m.hole_id and slot = m.slot and day = p_day
      returning * into g;
  end if;
  select * into t from fl_games where hole_id = m.hole_id and slot = 1 - m.slot and day = p_day;
  return jsonb_build_object('day', p_day, 'mine', wh_fl_game(g, true), 'theirs', wh_fl_game(t, g.done));
end $$;

revoke execute on function public.wh_fl_game(public.fl_games, boolean), public.wh_fl_state(text), public.wh_fl_guess(date, int, text) from public, anon, authenticated;
grant execute on function public.wh_fl_state(text), public.wh_fl_guess(date, int, text) to authenticated;

notify pgrst, 'reload schema';
