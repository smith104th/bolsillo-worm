# Backups

Every day `.github/workflows/backup.yml` dumps the database into the private R2 bucket
`bolsillo-worm`:

- `backups/daily/pocket-YYYY-MM-DD.sql.gz`: tables in `public` and `private` (holes, members,
  events, media rows, dailies, planted, sealed, push keys), schema and data. Kept 30 days.
- `backups/daily/auth-YYYY-MM-DD.sql.gz`: the anonymous sign-ins (`auth.users`, `auth.identities`).
- `backups/monthly/…-YYYY-MM.sql.gz`: the first good copy of each month, kept forever.

Photo and whisper files live in the same bucket under `media/`, so a dump plus the bucket is
everything. The app's "Save everything" zip is a separate, readable keepsake.

## Restoring into a fresh Supabase project

1. Create the project and turn on anonymous sign-ins.
2. Load the auth rows: `gunzip -c auth-….sql.gz | psql "$NEW_DB_URL"`.
3. Load the pocket: `gunzip -c pocket-….sql.gz | psql "$NEW_DB_URL"`. If objects already exist,
   restore into an empty project or drop `public` first.
4. Update `config.json` (URL + publishable key), the GitHub secrets and the project ref in
   `.github/workflows/supabase.yml`, then push. Phones sign back in with the same sessions
   only if the JWT secret matches; otherwise use the pocket code (Been here before?).
