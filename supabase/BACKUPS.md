# Backups

Every day `.github/workflows/backup.yml` dumps the database into the private R2 bucket
`bolsillo-worm`:

- `backups/daily/pocket-YYYY-MM-DD.sql.gz`: tables in `public` and `private` (holes, members,
  events, media rows, dailies, planted, sealed, the games, push keys), schema and data. Kept 30 days.
- `backups/daily/auth-YYYY-MM-DD.sql.gz`: the anonymous sign-ins (`auth.users`, `auth.identities`).
- `backups/monthly/…-YYYY-MM.sql.gz`: the first good copy of each month, kept forever.

Photo and whisper files live in the same bucket under `media/`, so a dump plus the bucket is
everything. The app's "Save everything" zip is a separate, readable keepsake.

## A second copy outside Cloudflare (the vault)

Every Sunday `.github/workflows/vault.yml` copies every file under `media/` and the newest daily
backup into the private repo **smith104th/bolsillo-worm-vault** (`media/`, `database/pocket.sql.gz`,
`database/auth.sql.gz`, `database/DAY`). Git keeps every week's backup in that repo's history.
It needs the repo secret `VAULT_TOKEN` (a fine-grained GitHub token: Contents read and write on the
vault repo only); without it the job warns and copies nothing. If R2 is gone, restore from the vault.

## Restore test

`.github/workflows/restore-test.yml` (the 3rd of each month, or Actions → Restore test → Run
workflow) restores the newest daily backup into a throwaway local Supabase database on the runner and
checks it with `supabase/restore-check.sql`: the pockets, members and sign-ins live had, the app's
functions answering as each of you, private helpers still locked, and every photo file the database
points to present in R2. Nothing live is touched. First run Nov 14 2026: passed.

## Restoring into a fresh Supabase project

Use Postgres client tools at least as new as the server (`psql --version`). `NEW_DB_URL` is the new
project's session pooler connection string.

1. Create the project (same Postgres major version as the backup) and turn on anonymous sign-ins.
2. Load the sign-ins: `gunzip -c auth-….sql.gz | psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 --single-transaction`.
3. Load the pocket. A new project already has the `public` schema, so drop that one line:
   `gunzip -c pocket-….sql.gz | sed '/^CREATE SCHEMA public;$/d' | psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 --single-transaction`.
4. Put the permissions back. The backup is taken with `--no-privileges`, so without this step every
   function would be callable by anyone signed in: `psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/schema.sql`
   (re-runnable; it only adds what's missing and re-applies the grants).
5. Photos: if the R2 bucket is fine, keep it. If not, make a new bucket and upload the vault's
   `media/` folder to it under `media/` (same file names), then set the R2 secrets.
6. Update `config.json` (URL + publishable key), the GitHub secrets and the project ref in
   `.github/workflows/supabase.yml`, then push. Phones sign back in with the same sessions
   only if the JWT secret matches; otherwise use the pocket code (Been here before?).
