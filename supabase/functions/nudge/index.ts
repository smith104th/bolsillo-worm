// Bolsillo Worm · nudge
// Sends a push notification to the other worm when something lands in their pocket.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "https://smith104th.github.io/bolsillo-worm/",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const KISS = ["", "a piquito", "a besito", "a beso", "a besote", "a BESAZO"];

function compose(kind: string, me: any, them: any, extra: any = {}) {
  const n = me?.name ?? "Your worm";
  const w = me?.worm?.name ?? "your worm";
  switch (kind) {
    case "note":    return { title: `${n} slipped a note in your pocket`, body: extra.preview ?? "Unfold it." };
    case "doodle":  return { title: `${n} drew you something`, body: "It's folded up in your pocket." };
    case "photo":   return { title: `A polaroid fell into your pocket`, body: extra.caption || `From ${n}.` };
    case "whisper": return { title: `${n} whispered something`, body: "Hold it up to your ear." };
    case "wiggle":  return { title: `${w} wiggled at you`, body: extra.label ?? "Feel it." };
    case "trinket": return { title: `${n} found you ${extra.what ?? "something"}`, body: extra.inscription || "It's in your pocket." };
    case "kiss":    return { title: `${n} sent you ${KISS[extra.level ?? 1] ?? "a kiss"}`, body: "💋".repeat(Math.max(1, Math.min(5, extra.level ?? 1))) };
    case "knock":   return { title: `Knock knock`, body: `${n} is thinking about you.` };
    case "ring":    return { title: `${n} is in the pocket right now`, body: "Come say hi. The hole is open." };
    case "feed":    return { title: `${n} fed you`, body: extra.food ? `A little ${extra.food}. Ñam.` : "A little crumb. Ñam." };
    case "daily":
      if (extra.both) return { title: `Today's ${extra.part === "photo" ? "photos are" : "answers are"} up`, body: `Go see what ${n} ${extra.part === "photo" ? "saw" : "said"}.` };
      return { title: extra.part === "photo" ? `${n} took today's photo` : `${n} answered today's question`, body: "It's buried until you do yours." };
    case "tunnel":  return { title: `You dug all the way through`, body: `${extra.km ?? ""} km of tunnel. Your worms just met.` };
    case "reunion": return { title: `${n} set the countdown`, body: extra.note ? `Same pocket: ${extra.note}` : "Same pocket soon." };
    case "arrived": return { title: `${n} crawled into your pocket`, body: "Bolsillo Worm is ready." };
    default:        return { title: `Something moved in your pocket`, body: `From ${n}.` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("WH_URL") ?? Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("WH_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error: ue } = await sb.auth.getUser(token);
    if (ue || !u?.user) return json({ error: "unauthorized" }, 401);

    const { kind, extra } = await req.json().catch(() => ({}));
    if (!kind) return json({ error: "no kind" }, 400);

    const { data: members, error } = await sb.from("members").select("slot,user_id,name,worm,push");
    if (error) return json({ error: error.message }, 500);
    const me = members?.find((m) => m.user_id === u.user.id);
    const them = members?.find((m) => m.user_id !== u.user.id);
    if (!me) return json({ error: "no hole" }, 403);
    if (!them?.push?.endpoint) return json({ sent: false, reason: "no_subscription" });

    const msg = { ...compose(kind, me, them, extra ?? {}), kind, tag: kind === "pet" ? "pet" : `${kind}-${Date.now()}` };
    try {
      await webpush.sendNotification(them.push, JSON.stringify(msg), { TTL: 60 * 60 * 24, urgency: kind === "ring" ? "high" : "normal" });
      return json({ sent: true });
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.rpc("wh_drop_push", { p_slot: them.slot });
      return json({ sent: false, status: e?.statusCode ?? null, error: String(e?.body ?? e?.message ?? e) });
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
