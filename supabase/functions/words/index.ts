// Bolsillo Worm · words
// Five Letters plays the New York Times' Wordle answer from two days before (Manu, Nov 13). This puts
// those answers in public.fl_words (one row per NYT date, shared by every pocket), so wh_fl_state can
// lock in the day's word. The app calls it when wh_fl_state has no word yet. While it's here it also
// gets tomorrow's (yesterday's NYT answer), so the next day's first open doesn't have to wait.
// It never hands the word back: the app gets it from wh_fl_state like everything else.
// On Nov 13 (the first day) NYT didn't give it the word. So a GitHub job (supabase/words.sh, twice a
// day) now fills fl_words ahead of time from github.com/eithan/wordlelist (a public list of every NYT
// answer, updated daily), and this function asks the NYT and that list at the same time, NYT's answer
// first. `why` says what each one answered.
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
const LIST = Deno.env.get("WORDLIST_URL") || "https://raw.githubusercontent.com/eithan/wordlelist/main/played-dates.json";
const FIRST = Date.UTC(2021, 5, 19); // puzzle 0

// the public list: { WORD: [[puzzle number, "M/D/YY"], ...] } → date → word (only entries whose number fits the date)
async function fromList(): Promise<{ byDay: Map<string, string>; why: string }> {
  const byDay = new Map<string, string>();
  try {
    const res = await fetch(LIST, { headers: { "user-agent": "BolsilloWorm/1.0 (private two-person app)" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) { await res.body?.cancel(); return { byDay, why: `list http ${res.status}` }; }
    const j = await res.json();
    for (const [word, plays] of Object.entries(j as Record<string, [number, string][]>)) {
      const w = String(word).trim().toLowerCase();
      if (!/^[a-z]{5}$/.test(w) || !Array.isArray(plays)) continue;
      for (const [n, d] of plays) {
        const [m, dd, yy] = String(d).split("/").map(Number);
        const t = Date.UTC(2000 + yy, m - 1, dd);
        if (Math.round((t - FIRST) / 86400000) === Number(n)) byDay.set(new Date(t).toISOString().slice(0, 10), w);
      }
    }
    return { byDay, why: "ok" };
  } catch (e) {
    return { byDay, why: `list ${(e as Error)?.name === "TimeoutError" ? "timed out" : String((e as Error)?.message ?? e).slice(0, 100)}` };
  }
}

// the answer for one date, or why there isn't one (NYT down, blocked, slow, or the answer looks wrong)
async function nyt(day: string): Promise<{ word: string | null; why: string }> {
  try {
    const res = await fetch(`${NYT}/${day}.json`, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; BolsilloWorm/1.0)",
        referer: "https://www.nytimes.com/games/wordle/index.html",
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) { await res.body?.cancel(); return { word: null, why: `http ${res.status}` }; }
    const j = await res.json().catch(() => null);
    const w = String(j?.solution ?? "").trim().toLowerCase();
    return /^[a-z]{5}$/.test(w) ? { word: w, why: "ok" } : { word: null, why: "no solution in the answer" };
  } catch (e) {
    return { word: null, why: String((e as Error)?.name === "TimeoutError" ? "timed out" : (e as Error)?.message ?? e).slice(0, 120) };
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
    const got: string[] = [], missing: string[] = [], why: Record<string, string> = {};
    const need = want.filter((day) => !have.has(day));
    if (need.length) {
      // the NYT (each date) and the public list, all at once: a slow source costs one timeout, not several
      const [answers, list] = await Promise.all([Promise.all(need.map(nyt)), fromList()]);
      for (const [i, day] of need.entries()) {
        const word = answers[i].word || list.byDay.get(day) || null;
        why[day] = `nyt ${answers[i].why}; ${list.why}${list.byDay.has(day) ? "" : " (not in it)"}`;
        if (!word) { missing.push(day); continue; }
        await sql`insert into public.fl_words (day, word) values (${day}, ${word}) on conflict (day) do nothing`;
        got.push(day);
      }
    }
    got.sort(); missing.sort();
    return json({ ready: !missing.includes(m.today_word), got, missing, why });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
