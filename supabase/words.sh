#!/usr/bin/env bash
# Five Letters: puts the NYT's Wordle answers for the last few days (and tomorrow's, if it's out) in
# public.fl_words. The game on day D plays the answer from D - 2, and a pocket locks in its word the
# first time either of you opens the game, so the answers need to be there before then.
# Run by .github/workflows/words.yml twice a day. The words function (supabase/functions/words) does
# the same on demand, but NYT didn't answer it on Nov 13 (from Supabase's servers), so this is the main way in.
# Never prints the words (the repo and its logs are public).
set -euo pipefail
: "${DB_URL:?DB_URL is not set}"
NYT="${NYT_URL:-https://www.nytimes.com/svc/wordle/v2}"
got=0 have=0
for off in -5 -4 -3 -2 -1 0 1; do
  day=$(date -u -d "$off day" +%F)
  if [ "$(psql "$DB_URL" -X -tAc "select 1 from public.fl_words where day = '$day'")" = "1" ]; then have=$((have + 1)); echo "$day already in"; continue; fi
  out=$(curl -sS -m 15 --retry 2 --retry-delay 3 -w '\n%{http_code}' \
    -A 'BolsilloWorm/1.0 (private two-person app)' \
    -H 'accept: application/json' -H 'referer: https://www.nytimes.com/games/wordle/index.html' \
    "$NYT/$day.json" 2>&1) || true
  code=${out##*$'\n'}
  word=$(printf '%s' "${out%$'\n'*}" | python3 -c 'import json, sys, re
try: w = str(json.load(sys.stdin).get("solution", "")).strip().lower()
except Exception: w = ""
print(w if re.fullmatch("[a-z]{5}", w) else "")' || true)
  if [ -z "$word" ]; then echo "$day: no answer (HTTP $code)"; continue; fi
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "insert into public.fl_words (day, word) values ('$day', '$word') on conflict (day) do nothing"
  echo "$day stored"; got=$((got + 1))
done
echo "stored $got new, $have were already in"
# nothing new and nothing there: the NYT isn't answering us
[ $((got + have)) -gt 0 ] || { echo "::error::Couldn't get any Wordle answer from the NYT"; exit 1; }
