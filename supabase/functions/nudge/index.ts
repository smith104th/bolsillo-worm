// Bolsillo Worm · nudge
// Sends a push notification to the other worm when something lands in their pocket.
// Its push keys are generated here on first use and kept in private.vapid, so no secrets get copied around.
import webpush from "npm:web-push@3.6.7";
import postgres from "npm:postgres@3.4.5";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUBJECT = "https://smith104th.github.io/bolsillo-worm/";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false, idle_timeout: 20 });

let ready: Promise<string> | null = null;
function vapid(): Promise<string> {
  ready ??= (async () => {
    let [row] = await sql`select public_key, private_key from private.vapid where id = 1`;
    if (!row) {
      const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const pub = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
      const { d } = await crypto.subtle.exportKey("jwk", kp.privateKey);
      await sql`insert into private.vapid (id, public_key, private_key) values (1, ${pub}, ${d!}) on conflict (id) do nothing`;
      [row] = await sql`select public_key, private_key from private.vapid where id = 1`;
    }
    webpush.setVapidDetails(SUBJECT, row.public_key, row.private_key);
    return row.public_key as string;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const KISS = ["", "a piquito", "a besito", "a beso", "a besote", "a BESAZO"];
const KISS_EMOJI = ["", "😗", "😙", "😘", "💋", "😍"];

function compose(kind: string, me: any, extra: any = {}) {
  const n = me?.name ?? "Your worm";
  const w = me?.worm?.name ?? "Your worm";
  switch (kind) {
    case "note":    return { title: `${n} slipped a note in your pocket`, body: extra.preview ?? "Unfold it." };
    case "doodle":  return { title: `${n} drew you something`, body: "It's folded up in your pocket." };
    case "photo":   return { title: "A polaroid fell into your pocket", body: extra.caption || `From ${n}.` };
    case "whisper": return { title: `${n} whispered something`, body: "Hold it up to your ear." };
    case "wiggle":  return { title: `${w} wiggled at you`, body: extra.label ?? "Feel it." };
    case "trinket": return { title: `${n} found you ${extra.what ?? "something"}`, body: extra.inscription || "It's in your pocket." };
    case "song":    return { title: `${n} sent you a song 🎵`, body: [extra.title ? `${extra.title}${extra.artist ? ` · ${extra.artist}` : ""}` : null, extra.line ? `“${extra.line}”` : null].filter(Boolean).join("  ") || "It's spinning in your pocket." };
    case "kiss":    return { title: `${n} sent you ${KISS[extra.level ?? 1] ?? "a kiss"} ${KISS_EMOJI[extra.level ?? 1] ?? "💋"}`, body: "💋".repeat(Math.max(1, Math.min(5, extra.level ?? 1))) };
    case "react":   return extra.about ? { title: `${n} reacted ${extra.emoji ?? "❤️"}`, body: `To your ${extra.about}.` } : { title: `${n} sent you ${extra.emoji ?? "❤️"}`, body: "Through the hole." };
    case "knock":   return { title: "Knock knock", body: `${n} is thinking about you.` };
    case "ring":    return { title: `${n} is in the pocket right now`, body: "Come say hi. The hole is open." };
    case "feed":    return { title: `${n} fed you`, body: extra.food ? `${extra.food[0].toUpperCase()}${extra.food.slice(1)}. Ñam.` : "A little crumb. Ñam." };
    case "daily":
      if (extra.both) return { title: `Today's ${extra.part === "photo" ? "photos are" : "answers are"} up`, body: `Go see what ${n} ${extra.part === "photo" ? "saw" : "said"}.` };
      return { title: extra.part === "photo" ? `${n} took today's photo` : `${n} answered today's question`, body: "It's buried until you do yours." };
    case "reunion": return { title: `${n} set the countdown`, body: extra.note ? `Same pocket: ${extra.note}` : "Same pocket soon." };
    case "later":   return extra.mode === "date"
      ? { title: `${n} wrapped a time capsule for you 🎁`, body: `It opens ${extra.when ?? "soon"}. Swipe to your shelf.` }
      : { title: `${n} left you an envelope 💌`, body: extra.label ? `Open when ${extra.label}.` : "It's on your shelf." };
    case "unsealed": return extra.mode === "date"
      ? { title: `${n} unwrapped your time capsule 🎁`, body: "It was worth the wait." }
      : { title: `${n} opened your envelope 💌`, body: extra.label ? `“Open when ${extra.label}”` : "The one you left on their shelf." };
    case "plant":   return { title: `${n} planted a question 🌱`, body: `It comes up ${extra.when ?? "soon"} as your question of the day.` };
    default:        return { title: "Something moved in your pocket", body: `From ${n}.` };
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

    const { kind, extra } = await req.json().catch(() => ({}));
    if (kind === "vapid") return json({ publicKey: await vapid() });
    if (!kind) return json({ error: "no kind" }, 400);

    const rows = await sql`
      select hole_id, slot, user_id, name, worm, push from public.members
      where hole_id = (select hole_id from public.members where user_id = ${u.user.id})`;
    const me = rows.find((m) => m.user_id === u.user.id);
    const them = rows.find((m) => m.user_id !== u.user.id);
    if (!me) return json({ error: "no hole" }, 403);
    if (!them?.push?.endpoint) return json({ sent: false, reason: "no_subscription" });

    await vapid();
    const msg = { ...compose(kind, me, extra ?? {}), kind, tag: `${kind}-${Date.now()}` };
    try {
      await webpush.sendNotification(them.push, JSON.stringify(msg), { TTL: 60 * 60 * 24, urgency: kind === "ring" ? "high" : "normal" });
      return json({ sent: true });
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await sql`update public.members set push = null where hole_id = ${me.hole_id} and slot = ${them.slot}`;
      }
      return json({ sent: false, status: e?.statusCode ?? null, error: String(e?.body ?? e?.message ?? e) });
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
