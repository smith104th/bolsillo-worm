# Bolsillo Worm

Carry each other. A pocket for two worms.

You each become a worm. Your worm lives in their phone (their pocket), theirs lives in yours. A worn-through hole in the denim connects the two pockets.

**Live app:** https://smith104th.github.io/bolsillo-worm/
**Try it with a pretend partner:** https://smith104th.github.io/bolsillo-worm/?demo

## What you can do

- **Pet** the worm in your pocket by stroking it, **boop** its head, pick it up with a long press.
- **Kiss**: hold the kiss button. The longer you hold, the bigger it gets: piquito, besito, beso, besote, BESAZO. They feel it as lipstick stamps on their screen.
- **Feed** it crumbs (medialuna, alfajor, empanada…) and **mist** it so it doesn't dry out. Neglected worms get hungry and dry, never dead.
- **Drop** things through the hole: notes, polaroids, whispers (voice), doodles, wiggles (buzz rhythms), found things (a pebble, a ticket stub, a matchbook).
- **Knock** to say you're thinking of them. **Call them in** to open the hole together.
- **Today**: one photo and one answer each, every day. Each half stays buried until you post yours. Old days settle into soil layers. Streaks count days you both did both.
- **Touch**: when you're both in the app at once, your worm comes through the hole and you see each other's fingertip. Hold them together and the worms knot up.
- **Us**: the real distance between your cities is a tunnel you dig together. Every pet, kiss, note and daily digs further. Worms grow longer the more you care for each other. Countdown to the next time you're in the same pocket.
- Their **time and weather** show in your pocket: it rains in there when it's raining on them, and their worm sleeps when it's night where they are.

## How it's built

- Installable web app (PWA), no app store. iPhone: Safari → Share → Add to Home Screen. Android: Chrome → Install.
- `src/` vanilla JS + canvas, bundled with esbuild into `docs/` (served by GitHub Pages).
- Supabase (free tier): Postgres + row level security, realtime presence and broadcast for live fingertips, anonymous sign-in per phone, an edge function for push notifications.
- `supabase/schema.sql` is the whole database. `supabase/test/` runs it against an in-memory Postgres.

```sh
npm install
node supabase/test/schema.test.mjs   # database tests
node build.mjs                        # → docs/
```

New phone? Open the app, use your hole's code (Us → Settings), and pick your worm to take it back.
