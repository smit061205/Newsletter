// The editor page (/editor; ROADMAP §6 phase B, item 4): who may open it, and what
// it reads and changes. Sign-in is Google's (decided 24 Oct: the father and the user,
// with their own accounts), done here without a library: the site sends the browser to
// Google, Google sends back a one-time code, the site swaps it for the person's
// address over its own connection to Google, and keeps a signed cookie for 30 days.
// Vercel's settings (never the repository): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// CK_EDITORS (the allowed addresses, comma-separated), CK_SESSION_SECRET (32+ characters).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { WEBSITE } from "./config.ts";
import { sample, sampleOn } from "./sample.ts";
import { touched } from "./write.ts";

type Sql = NeonQueryFunction<false, false>;

export const COOKIE = "ck_editor";
const DAYS = 30;

export const editors = () => (process.env.CK_EDITORS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const secret = () => process.env.CK_SESSION_SECRET ?? "";
/** Everything sign-in needs is in Vercel's settings. */
export const signInReady = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && secret().length >= 32 && editors().length > 0;

const mac = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function sessionFor(email: string): string {
  const body = `${Buffer.from(email).toString("base64url")}.${Date.now() + DAYS * 86400_000}`;
  return `${body}.${mac(body)}`;
}
export const sessionAge = DAYS * 86400;

/** The signed-in editor's address, or null. Checked again against CK_EDITORS, so removing an address there signs it out. */
export function editorOf(cookie: string | undefined): string | null {
  if (sampleOn() && !signInReady()) return "sample@localhost";
  if (!cookie || !signInReady()) return null;
  const [who, exp, sig] = cookie.split(".");
  if (!who || !exp || !sig || !same(sig, mac(`${who}.${exp}`)) || Number(exp) < Date.now()) return null;
  const email = Buffer.from(who, "base64url").toString();
  return editors().includes(email) ? email : null;
}

/** A short-lived signed value tying Google's answer to the browser that asked. */
export const stateFor = (nonce: string) => `${nonce}.${mac(`state.${nonce}`)}`;
export const stateOk = (state: string, nonce: string) => !!nonce && same(state, stateFor(nonce));

export function googleUrl(origin: string, state: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "", redirect_uri: `${origin}/api/editor/callback`, response_type: "code",
    scope: "openid email", state, prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Google's one-time code swapped for the person's verified address (straight from Google, over its own connection). */
export async function emailFrom(origin: string, code: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
                                redirect_uri: `${origin}/api/editor/callback`, grant_type: "authorization_code" }),
  });
  const t = (await res.json().catch(() => ({}))) as { id_token?: string };
  if (!res.ok || !t.id_token) return null;
  const claims = JSON.parse(Buffer.from(t.id_token.split(".")[1] ?? "", "base64url").toString() || "{}") as { aud?: string; email?: string; email_verified?: boolean };
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !claims.email_verified || !claims.email) return null;
  const email = claims.email.toLowerCase();
  return editors().includes(email) ? email : null;
}

// ---- what the page shows ----

export interface DeskStory { id: string; headline: string; deck: string; body: string; reason: string; at: string; tier: string; sources: { name: string; url: string }[] }
export interface DeskFeature { id: string; beat: string; headline: string; dek: string; body: string; status: string; at: string }
export interface DeskRun { at: string; ok: boolean; ai: number | null; seconds: number | null }
export interface Desk {
  held: DeskStory[]; drafts: DeskFeature[];
  runs: DeskRun[]; paused: boolean; today: { stories: number; ai: number; aiLimit: number; uploads: number; uploadLimit: number };
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : "");
const story = (r: Row): DeskStory => ({ id: r.id as string, headline: r.headline as string, deck: (r.deck as string) ?? "", body: (r.body as string) ?? "",
  reason: (r.hold_reason as string) ?? "", at: iso(r.published_at), tier: (r.tier as string) ?? "", sources: (r.sources as DeskStory["sources"]) ?? [] });
const feature = (r: Row): DeskFeature => ({ id: r.id as string, beat: r.beat as string, headline: r.headline as string, dek: (r.dek as string) ?? "",
  body: (r.body as string) ?? "", status: r.status as string, at: iso(r.published_at ?? r.created_at) });

export async function desk(sql: Sql | null): Promise<Desk> {
  const today = { stories: 0, ai: 0, aiLimit: WEBSITE.dailyGoogleRequests + WEBSITE.dailyFreeRequests, uploads: 0, uploadLimit: 2000 };
  if (!sql) {
    // local checking: the sample stories stand in
    const s = sampleOn() ? sample().stories : [];
    const ds = (x: (typeof s)[number], reason = ""): DeskStory => ({ id: x.id, headline: x.headline, deck: x.deck, body: x.body, reason, at: x.publishedAt, tier: x.tier,
      sources: x.source ? [{ name: x.source.name, url: x.source.url }] : [] });
    return { held: s.slice(0, 2).map((x) => ds(x, "સંવેદનશીલ સમાચાર")), drafts: [], runs: [], paused: false, today };
  }
  const [held, drafts, runs, paused, counts] = await Promise.all([
    sql.query(`select id, headline, deck, body, hold_reason, published_at, tier, sources from stories where status = 'held' order by published_at desc limit 50`),
    sql.query(`select id, beat, headline, dek, body, status, published_at, created_at from features where status in ('draft', 'held') order by created_at desc limit 30`),
    sql.query(`select started_at, ok, details from runs where kind = 'engine' order by started_at desc limit 8`),
    sql.query(`select value from state where key = 'engine_paused'`),
    sql.query(`select
       (select count(*) from stories where origin = 'live' and status = 'published' and published_at > now() - interval '24 hours') as stories,
       (select coalesce(sum(n), 0) from usage where day = (now() at time zone 'Asia/Kolkata')::date and kind like 'ai%') as ai,
       (select coalesce(sum(n), 0) from usage where kind = 'upload' and day >= date_trunc('month', now() at time zone 'Asia/Kolkata')) as uploads`),
  ]);
  const c = counts[0] ?? {};
  return {
    held: held.map(story), drafts: drafts.map(feature),
    runs: runs.map((r) => {
      const d = (r.details ?? {}) as { aiRequests?: number; seconds?: number };
      return { at: iso(r.started_at), ok: r.ok !== false, ai: d.aiRequests ?? null, seconds: d.seconds ?? null };
    }),
    paused: paused[0]?.value === "yes",
    today: { ...today, stories: Number(c.stories ?? 0), ai: Number(c.ai ?? 0), uploads: Number(c.uploads ?? 0) },
  };
}

// ---- every story and article, searched and shown a page at a time ----

export type Show = "site" | "removed";
export interface Found { id: string; headline: string; at: string; status: string; kind: string }
export const PAGE = 25;

/** Capital Kranti's stories (the engine's and the printed paper's), newest first: those on the site or those taken
 *  down, matching the words searched for in the headline, sub-heading or story; one more than asked, to know if there are more. */
export async function findStories(sql: Sql | null, q: string, show: Show, n: number): Promise<{ rows: Found[]; more: boolean }> {
  const want = show === "removed" ? "withdrawn" : "published";
  if (!sql) {
    const s = sampleOn() ? sample().stories : [];
    const hit = show === "removed" ? [] : s.filter((x) => !q || `${x.headline} ${x.deck} ${x.body}`.includes(q));
    return { rows: hit.slice(0, n).map((x) => ({ id: x.id, headline: x.headline, at: x.publishedAt, status: "published", kind: x.origin ?? "paper" })), more: hit.length > n };
  }
  const rows = await sql.query(
    `select id, headline, published_at, status, origin from stories where status = $1
       and ($2 = '' or headline ilike $3 or deck ilike $3 or body ilike $3 or id = $2)
     order by published_at desc limit $4`, [want, q, `%${q}%`, n + 1]);
  return { rows: rows.slice(0, n).map((r) => ({ id: r.id as string, headline: r.headline as string, at: iso(r.published_at), status: r.status as string, kind: r.origin as string })), more: rows.length > n };
}

/** Aavtikal's published or taken-down articles, likewise. */
export async function findFeatures(sql: Sql | null, q: string, show: Show, n: number): Promise<{ rows: Found[]; more: boolean }> {
  if (!sql) return { rows: [], more: false };
  const rows = await sql.query(
    `select id, headline, coalesce(published_at, created_at) as at, status, beat from features where status = $1
       and ($2 = '' or headline ilike $3 or dek ilike $3 or body ilike $3)
     order by coalesce(published_at, created_at) desc limit $4`, [show === "removed" ? "withdrawn" : "published", q, `%${q}%`, n + 1]);
  return { rows: rows.slice(0, n).map((r) => ({ id: r.id as string, headline: r.headline as string, at: iso(r.at), status: r.status as string, kind: r.beat as string })), more: rows.length > n };
}

// ---- one story or article, to change ----

export interface Editable { id: string; headline: string; deck: string; body: string; caption: string; hasPhoto: boolean; status: string; at: string; kind: string }

export async function storyFor(sql: Sql | null, id: string): Promise<Editable | null> {
  if (!sql) {
    const x = sampleOn() ? sample().stories.find((s) => s.id === id) : undefined;
    return x ? { id: x.id, headline: x.headline, deck: x.deck, body: x.body, caption: x.caption, hasPhoto: !!x.photo, status: "published", at: x.publishedAt, kind: x.origin ?? "paper" } : null;
  }
  const [r] = await sql.query(`select id, headline, deck, body, caption, photo, status, published_at, origin from stories where id = $1`, [id]);
  return r ? { id: r.id, headline: r.headline, deck: r.deck ?? "", body: r.body ?? "", caption: r.caption ?? "", hasPhoto: !!r.photo, status: r.status, at: iso(r.published_at), kind: r.origin } : null;
}
export async function featureFor(sql: Sql | null, id: string): Promise<Editable | null> {
  if (!sql) return null;
  const [r] = await sql.query(`select id, headline, dek, body, caption, photo, status, coalesce(published_at, created_at) as at, beat from features where id = $1`, [id]);
  return r ? { id: r.id, headline: r.headline, deck: r.dek ?? "", body: r.body ?? "", caption: r.caption ?? "", hasPhoto: !!r.photo, status: r.status, at: iso(r.at), kind: r.beat } : null;
}

export interface Words { headline: string; deck: string; body: string; caption: string }

/** The editor's own words for a story. Its English is made again on the next hourly run (lib/write.ts's
 *  'pending'), and its Hindi set aside: until then those pages show the Gujarati. */
export async function saveStory(sql: Sql, id: string, w: Words, by: string): Promise<boolean> {
  const done = await sql.query(
    `update stories set headline = $2, deck = $3, body = $4, caption = $5, updated_at = now(), en_status = 'pending', hi_status = 'none'
      where id = $1 and status <> 'withdrawn' returning id`, [id, w.headline, w.deck, w.body, w.caption]);
  if (done.length) console.log(`story ${id} changed by ${by}`);
  if (done.length) await touched(sql);
  return done.length > 0;
}
/** Likewise for an Aavtikal article; its English and Hindi are set aside (those pages show the Gujarati). */
export async function saveFeature(sql: Sql, id: string, w: Words): Promise<boolean> {
  const done = await sql.query(
    `update features set headline = $2, dek = $3, body = $4, caption = $5, en = null, hi = null, updated_at = now() where id = $1 returning id`,
    [id, w.headline, w.deck, w.body, w.caption]);
  if (done.length) await touched(sql);
  return done.length > 0;
}

/** A story taken down by mistake goes back up. */
export async function restoreStory(sql: Sql, id: string): Promise<boolean> {
  const done = await sql.query(`update stories set status = 'published', hold_reason = null, updated_at = now() where id = $1 and status = 'withdrawn' returning id`, [id]);
  if (done.length) await touched(sql);
  return done.length > 0;
}

// ---- what the editor decides (each recorded with who decided) ----

export async function decideStory(sql: Sql, id: string, approve: boolean, by: string): Promise<boolean> {
  const done = approve
    ? await sql.query(`update stories set status = 'published', published_at = now(), updated_at = now(), hold_reason = null where id = $1 and status = 'held' returning id`, [id])
    : await sql.query(`update stories set status = 'withdrawn', hold_reason = 'rejected by the editor' where id = $1 and status = 'held' returning id`, [id]);
  if (!done.length) return false;
  await sql.query(`insert into approvals (story_id, decided_at, decision, decided_by) values ($1, now(), $2, $3)
                   on conflict (story_id) do update set decided_at = now(), decision = $2, decided_by = $3`, [id, approve ? "approve" : "reject", by]);
  if (approve) await touched(sql);
  return true;
}

export async function withdrawStory(sql: Sql, id: string, by: string): Promise<boolean> {
  const done = await sql.query(`update stories set status = 'withdrawn', hold_reason = $2, updated_at = now() where id = $1 and status = 'published' returning id`,
    [id, `withdrawn by the editor (${by})`]);
  if (done.length) await touched(sql);
  return done.length > 0;
}

export async function decideFeature(sql: Sql, id: string, to: "published" | "withdrawn"): Promise<boolean> {
  const done = to === "published"
    ? await sql.query(`update features set status = 'published', published_at = coalesce(published_at, now()), updated_at = now() where id = $1 and status in ('draft', 'held', 'withdrawn') returning id`, [id])
    : await sql.query(`update features set status = 'withdrawn', updated_at = now() where id = $1 and status <> 'withdrawn' returning id`, [id]);
  if (done.length) await touched(sql);
  return done.length > 0;
}

export async function setPaused(sql: Sql, paused: boolean) {
  await sql.query(`insert into state (key, value) values ('engine_paused', $1) on conflict (key) do update set value = excluded.value`, [paused ? "yes" : "no"]);
}
