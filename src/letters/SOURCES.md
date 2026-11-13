# Five Letters word lists

The day's word comes from the New York Times (its Wordle answer from two days before, fetched by
`supabase/functions/words`). These two lists live in the app:

- `guesses.txt`: every five-letter word the game accepts as a guess (12,675). The union of the
  five-letter words in SCOWL up to size 70 (all English variants, via the `wordlist-english` npm
  package) and in `word-list` by Sindre Sorhus (MIT). The day's word is always accepted too.
- `answers.txt`: common words (2,041) for a day the NYT word can't be fetched. SCOWL up to size 35
  (English and American), without plurals, -ed and -ing forms, and a few words nobody wants as a
  daily puzzle. Both phones pick the same one from the date, and the server locks in whichever
  arrives first, so two phones on different app versions still play the same word.

`build.mjs` packs both into `docs/letters/words.json`.

## SCOWL

The collective work is Copyright 2000-2016 by Kevin Atkinson as well
as any of the copyrights mentioned below:

  Copyright 2000-2016 by Kevin Atkinson

  Permission to use, copy, modify, distribute and sell these word
  lists, the associated scripts, the output created from the scripts,
  and its documentation for any purpose is hereby granted without fee,
  provided that the above copyright notice appears in all copies and
  that both that copyright notice and this permission notice appear in
  supporting documentation. Kevin Atkinson makes no representations
  about the suitability of this array for any purpose. It is provided
  "as is" without express or implied warranty.

The full notice (including the lists SCOWL is built from) is at http://wordlist.aspell.net/.

## word-list

MIT License, Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
