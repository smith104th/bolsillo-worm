#!/usr/bin/env bash
# Applies supabase/migrations/*.sql that haven't run yet, each in one transaction, and
# records them in private.migrations. 002–005 were run by hand before this existed.
# Used by .github/workflows/supabase.yml with DB_URL = the session pooler connection string.
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:-} --client-min-messages=warning"
: "${DB_URL:?DB_URL is not set}"
q() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

q <<'SQL'
create schema if not exists private;
create table if not exists private.migrations (name text primary key, applied_at timestamptz not null default now());
revoke all on private.migrations from public;
insert into private.migrations (name) values ('002_reactions.sql'), ('003_dig.sql'), ('004_shelf.sql'), ('005_song.sql')
on conflict do nothing;
SQL

for f in $(ls supabase/migrations/*.sql | sort); do
  n=$(basename "$f")
  if [ "$(q -tAc "select 1 from private.migrations where name = '$n'")" = "1" ]; then echo "· $n (already applied)"; continue; fi
  echo "→ applying $n"
  q --single-transaction -f "$f" -c "insert into private.migrations (name) values ('$n')"
done
