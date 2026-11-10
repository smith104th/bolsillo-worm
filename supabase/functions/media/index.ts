// Bolsillo Worm · media
// Photos and whispers live in a private Cloudflare R2 bucket. This function is the only
// thing holding the bucket's keys: it puts files in, hands members short-lived links to
// read them, and moves old photos out of the database.
//
//   POST ?op=ping                  → { ready }  (are the R2 secrets set?)
//   POST ?op=put   body = the file → { id }     (content-type = the file's type)
//   POST ?op=url   { ids: [..] }   → { urls: { id: url } }  (links last an hour)
//   POST ?op=migrate               → { moved, left }  (old rows from the database to R2)
//
// Secrets (set by .github/workflows/supabase.yml from the repo's GitHub secrets):
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, optional R2_BUCKET.
import postgres from "npm:postgres@3.4.5";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ACCOUNT = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const SECRET = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const BUCKET = Deno.env.get("R2_BUCKET") || "bolsillo-worm";
const READY = Boolean(ACCOUNT && KEY_ID && SECRET);
// R2_ENDPOINT only for tests (or another S3-compatible store); R2 itself is the default
const BASE = `${Deno.env.get("R2_ENDPOINT") || `https://${ACCOUNT}.r2.cloudflarestorage.com`}/${BUCKET}`;
const r2 = READY ? new AwsClient({ accessKeyId: KEY_ID, secretAccessKey: SECRET, service: "s3", region: "auto" }) : null;

const MAX_BYTES = 4_000_000;
const OK_TYPE = /^(image|audio)\/[a-z0-9.+-]+$/i;

// DB_URL is set by .github/workflows/supabase.yml from the repo secret, so a password reset
// only needs the GitHub secret updated; SUPABASE_DB_URL is the platform default.
const sql = postgres(Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false, idle_timeout: 20 });

async function putObject(key: string, bytes: Uint8Array, type: string) {
  const res = await r2!.fetch(`${BASE}/${key}`, { method: "PUT", body: bytes, headers: { "content-type": type } });
  if (!res.ok) throw new Error(`r2_put_${res.status}`);
}
async function deleteObject(key: string) {
  try { await r2!.fetch(`${BASE}/${key}`, { method: "DELETE" }); } catch { /* an orphan file is harmless */ }
}
async function signedUrl(key: string) {
  const u = new URL(`${BASE}/${key}`);
  u.searchParams.set("X-Amz-Expires", "3600");
  const signed = await r2!.sign(new Request(u, { method: "GET" }), { aws: { signQuery: true } });
  return signed.url;
}
function fromDataUrl(s: string): { type: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(s);
  if (!m || !m[2]) return null;
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type: m[1] || "application/octet-stream", bytes };
}
const newKey = () => `media/${crypto.randomUUID()}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const op = new URL(req.url).searchParams.get("op") ?? "";
  if (op === "ping") return json({ ready: READY });
  if (!READY) return json({ error: "not_ready" }, 503);
  try {
    // who's asking, and which pocket they're in
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const apikey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, apikey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: u, error: ue } = await sb.auth.getUser(token);
    if (ue || !u?.user) return json({ error: "unauthorized" }, 401);
    const [me] = await sql`select hole_id, slot from public.members where user_id = ${u.user.id}`;
    if (!me) return json({ error: "no_hole" }, 403);

    if (op === "put") {
      const type = (req.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!OK_TYPE.test(type)) return json({ error: "bad_type" }, 415);
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length) return json({ error: "empty" }, 400);
      if (bytes.length > MAX_BYTES) return json({ error: "too_big" }, 413);
      const key = newKey();
      await putObject(key, bytes, type);
      try {
        const [row] = await sql`insert into public.media (hole_id, mime, r2, bytes, slot)
          values (${me.hole_id}, ${type}, ${key}, ${bytes.length}, ${me.slot}) returning id`;
        return json({ id: Number(row.id) });
      } catch (e) { await deleteObject(key); throw e; }
    }

    if (op === "url") {
      const { ids } = await req.json().catch(() => ({ ids: [] }));
      const want = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 200);
      if (!want.length) return json({ urls: {} });
      // your pocket only, and their daily photo stays buried until you've posted yours
      const rows = await sql`
        select x.id, x.r2 from public.media x
        where x.id = any(${want}::bigint[]) and x.hole_id = ${me.hole_id} and x.r2 is not null
          and not exists (
            select 1 from public.dailies th
            where th.photo = x.id and th.slot <> ${me.slot}
              and not exists (select 1 from public.dailies mine
                              where mine.hole_id = th.hole_id and mine.day = th.day and mine.slot = ${me.slot}
                                and mine.photographed_at is not null))`;
      const urls: Record<string, string> = {};
      for (const r of rows) urls[String(r.id)] = await signedUrl(r.r2);
      return json({ urls });
    }

    if (op === "migrate") {
      // a few at a time; skip locked rows so both phones can run this at once
      let moved = 0;
      await sql.begin(async (tx) => {
        const rows = await tx`select id, mime, data from public.media
          where hole_id = ${me.hole_id} and data is not null and r2 is null
          order by id limit 6 for update skip locked`;
        for (const r of rows) {
          const file = fromDataUrl(r.data);
          if (!file) continue;
          const key = newKey();
          await putObject(key, file.bytes, r.mime || file.type);
          await tx`update public.media set r2 = ${key}, bytes = ${file.bytes.length}, data = null where id = ${r.id}`;
          moved++;
        }
      });
      const [{ n }] = await sql`select count(*)::int n from public.media where hole_id = ${me.hole_id} and data is not null and r2 is null`;
      // once everything has moved, give the space back so the database actually shrinks
      if (moved && n === 0) { try { await sql.unsafe("vacuum (full, analyze) public.media"); } catch { /* next time */ } }
      return json({ moved, left: n });
    }

    return json({ error: "bad_op" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
