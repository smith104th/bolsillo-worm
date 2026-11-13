// Bolsillo Worm · words
// Five Letters plays the New York Times' Wordle answer from two days before (Manu, Nov 13). This puts
// those answers in public.fl_words (one row per NYT date, shared by every pocket), so wh_fl_state can
// lock in the day's word. The app calls it when wh_fl_state has no word yet. While it's here it also
// gets tomorrow's (yesterday's NYT answer), so the next day's first open doesn't have to wait.
// It never hands the word back: the app gets it from wh_fl_state like everything else.
import postgres from "npm:postgres@3.4.5";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// DB_URL is set by .github/workflows/supabase.yml from the repo secret; SUPABASE_DB_URL is the platform default.
const sql = postgres(Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false, idle_timeout: 20 });
const NYT = (Deno.env.get("NYT_URL") || "https://www.nytimes.com/svc/wordle/v2").replace(/\/$/, "");

// the answer for one date, or null if it can't be had (NYT down, blocked, or the answer looks wrong)
async function nyt(day: string): Promise<string | null> {
  try {
    const res = await fetch(`${NYT}/${day}.json`, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; BolsilloWorm/1.0)",
        referer: "https://www.nytimes.com/games/wordle/index.html",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) { await res.body?.cancel(); return null; }
    const j = await res.json().catch(() => null);
    const w = String(j?.solution ?? "").trim().toLowerCase();
    return /^[a-z]{5}$/.test(w) ? w : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const apikey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, apikey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: u, error: ue } = await sb.auth.getUser(token);
    if (ue || !u?.user) return json({ error: "unauthorized" }, 401);

    // the pocket's today (where its first worm lives), and the two NYT dates its games need
    const [m] = await sql`
      select (public.wh_today(hole_id) - 2)::text as today_word, (public.wh_today(hole_id) - 1)::text as next_word
      from public.members where user_id = ${u.user.id}`;
    if (!m) return json({ error: "no_hole" }, 403);
    const want = [m.today_word, m.next_word] as string[];
    const have = new Set((await sql`select day::text as day from public.fl_words where day = any(${want}::date[])`).map((r) => r.day));
    const got: string[] = [], missing: string[] = [];
    for (const day of want) {
      if (have.has(day)) continue;
      const word = await nyt(day);
      if (!word) { missing.push(day); continue; }
      await sql`insert into public.fl_words (day, word) values (${day}, ${word}) on conflict (day) do nothing`;
      got.push(day);
    }
    return json({ ready: !missing.includes(m.today_word), got, missing });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
