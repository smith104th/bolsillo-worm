#!/usr/bin/env bash
# Five Letters: puts recent Wordle answers in public.fl_words. The game on day D plays the answer from
# D - 2, and a pocket locks in its word the first time either of you opens the game, so the answers
# need to be there before then. Run by .github/workflows/words.yml twice a day (the list updates about 16:00 UTC).
# Source: github.com/eithan/wordlelist (played-dates.json: { WORD: [[puzzle number, "M/D/YY"], ...] }),
# a public list of every NYT answer that its owner updates once a day. On Nov 13 (the first live day)
# the NYT didn't hand the answer to our server, so this list is the main way in now; the words
# function still asks the NYT first when a word is missing. Never prints the words (the logs are public).
set -euo pipefail
: "${DB_URL:?DB_URL is not set}"
LIST="${WORDLIST_URL:-https://raw.githubusercontent.com/eithan/wordlelist/main/played-dates.json}"
trap 'rm -f played.json words.sql' EXIT
curl -fsS -m 30 --retry 3 --retry-delay 5 -A 'BolsilloWorm/1.0 (private two-person app)' "$LIST" -o played.json
# date → word for the last week, checked: five letters, and the puzzle number matches the date.
# Written as one insert (only checked dates and a-z words go in, so they're safe to inline).
python3 - > words.sql <<'PY'
import json, re, datetime
first = datetime.date(2021, 6, 19)  # puzzle 0
today = datetime.datetime.now(datetime.timezone.utc).date()
rows = {}
for word, plays in json.load(open('played.json')).items():
    w = str(word).strip().lower()
    if not re.fullmatch('[a-z]{5}', w): continue
    for n, d in plays:
        m, dd, yy = map(int, str(d).split('/'))
        day = datetime.date(2000 + yy, m, dd)
        if (day - first).days == int(n) and -8 <= (day - today).days <= 2:
            rows[day] = w
if rows:
    values = ', '.join(f"('{d}', '{w}')" for d, w in sorted(rows.items()))
    print(f"with ins as (insert into public.fl_words (day, word) values {values} on conflict (day) do nothing returning day) select count(*) || ' new, {len(rows)} in the list from the last week' from ins;")
PY
[ -s words.sql ] || { echo "::error::The word list has nothing recent (stale or moved?)"; exit 1; }
psql "$DB_URL" -X -q -tA -v ON_ERROR_STOP=1 -f words.sql
