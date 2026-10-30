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

export interface DeskRun { at: string; ok: boolean; ai: number | null; seconds: number | null }
/** Aavtikal's desk today: new articles published (of the day's target), older ones written again (of all), what it last did. */
export interface AvDesk { published: number; target: number; rewritten: number; toRewrite: number; at: string; running: boolean; lines: string[] }
export interface Desk {
  av: AvDesk | null;
  runs: DeskRun[]; paused: boolean; today: { stories: number; ai: number; aiLimit: number; uploads: number; uploadLimit: number };
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : "");
export async function desk(sql: Sql | null): Promise<Desk> {
  const today = { stories: 0, ai: 0, aiLimit: WEBSITE.dailyGoogleRequests + WEBSITE.dailyFreeRequests, uploads: 0, uploadLimit: 2000 };
  if (!sql) {
    return { av: null, runs: [], paused: false, today };
  }
  const date = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const [runs, paused, counts, av, avRun] = await Promise.all([
    sql.query(`select started_at, ok, details from runs where kind = 'engine' order by started_at desc limit 8`),
    sql.query(`select value from state where key = 'engine_paused'`),
    sql.query(`select
       (select count(*) from stories where origin = 'live' and status = 'published' and published_at > now() - interval '24 hours') as stories,
       (select coalesce(sum(n), 0) from usage where day = (now() at time zone 'Asia/Kolkata')::date and kind like 'ai%') as ai,
       (select coalesce(sum(n), 0) from usage where kind = 'upload' and day >= date_trunc('month', now() at time zone 'Asia/Kolkata')) as uploads`),
    sql.query(`select
       (select count(*) from features where author = 'desk' and status = 'published' and (created_at at time zone 'Asia/Kolkata')::date = $1::date) as published,
       (select count(*) from features where checks->>'rewritten' = 'true') as rewritten,
       (select count(*) from features where status = 'published' and beat <> 'politics'
          and (author <> 'desk' or photo is null or jsonb_array_length(figures) < 4)
          and coalesce(checks->>'rewritten', '') <> 'true' and coalesce(checks->>'by', '') <> 'editor'
          and (select count(*) from unnest(string_to_array(coalesce((select value from state where key = 'desk_redone_3'), ''), E'\n')) t where t = id) < 3) as left`, [date]),
    sql.query(`select started_at, finished_at, details from runs where kind = 'desk' order by started_at desc limit 1`),
  ]);
  const a = av[0] ?? {}, ar = avRun[0];
  const c = counts[0] ?? {};
  return {
    av: { published: Number(a.published ?? 0), target: WEBSITE.deskDays[date] ?? WEBSITE.deskDaily, rewritten: Number(a.rewritten ?? 0),
          toRewrite: Number(a.left ?? 0), at: iso(ar?.started_at), running: !!ar && !ar.finished_at && Date.now() - Date.parse(String(ar.started_at)) < 40 * 60_000,
          lines: ((ar?.details as { log?: string[] } | null)?.log ?? []).slice(-12) },
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
    `select id, headline, published_at, status, origin, checks->>'by' as by from stories where status = $1
       and ($2 = '' or headline ilike $3 or deck ilike $3 or body ilike $3 or id = $2)
     order by published_at desc limit $4`, [want, q, `%${q}%`, n + 1]);
  return { rows: rows.slice(0, n).map((r) => ({ id: r.id as string, headline: r.headline as string, at: iso(r.published_at), status: r.status as string, kind: r.by === "editor" ? "editor" : r.origin as string })), more: rows.length > n };
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

/** A story the editor writes on the editor page (29 Oct: the editor's own reports from conferences): on the site at
 *  once, at the top of the home page and in its section, word for word; the engine adds its English and Hindi
 *  (engine/run.ts translations()) and never a photo of its own. */
export interface NewStory {
  headline: string; deck: string; body: string; caption: string;
  tier: "gujarat" | "india" | "world"; genre: string | null;
  photos: { url: string; width: number; height: number }[];
}
export async function addStory(sql: Sql, x: NewStory, by: string): Promise<string> {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const id = `ed-${day.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const [photo, ...gallery] = x.photos;
  await sql.query(
    `insert into stories (id, origin, issue_date, tier, genres, tag_status, headline, deck, body, caption, photo, gallery, checked,
       importance, en_status, hi_status, status, photo_tried, checks, sources)
     values ($1, 'live', $2::date, $3, $4, 'done', $5, $6, $7, $8, $9, $10, false, 9, 'pending', 'none', 'published', true, $11, '[]')`,
    [id, day, x.tier, x.genre ? [x.genre] : [], x.headline, x.deck, x.body, photo ? x.caption : "", photo ? JSON.stringify(photo) : null,
     JSON.stringify(gallery), JSON.stringify({ by: "editor", who: by })]);
  console.log(`story ${id} written by ${by}`);
  await touched(sql);
  return id;
}

/** An Aavtikal article the editor wrote (app/(gu)/editor/write?for=aavtikal): on the site at once, word for word, as
 *  the editor's. The first photo leads it, the others are spread through its paragraphs as pictures ("[[fig N]]",
 *  views/Flagship.tsx); the desk adds its English and Hindi (engine/desk.ts, retranslate) and never rewrites it. */
export interface NewFeature {
  headline: string; deck: string; body: string; caption: string; beat: "ai" | "tech" | "science" | "politics";
  photos: { url: string; width: number; height: number }[];
}
export async function addFeature(sql: Sql, x: NewFeature, by: string): Promise<string> {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const id = `ed-${day.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const [photo, ...more] = x.photos;
  // the editor's paragraphs (a "[[fig" of their own taken out), each further photo after an even share of them
  // (after a paragraph, never between a "## " sub-heading and its text)
  const paras = x.body.split("\n\n").filter((p) => !/^\[\[fig/.test(p.trim()));
  const slots = paras.map((p, i) => (/^#/.test(p.trim()) ? -1 : i)).filter((i) => i >= 0);
  const after = (j: number) => slots[Math.max(0, Math.min(slots.length - 1, Math.round(((j + 1) * slots.length) / (more.length + 1)) - 1))];
  const body = paras.flatMap((p, i) => [p, ...more.map((_, j) => j).filter((j) => after(j) === i).map((j) => `[[fig ${j + 1}]]`)]).join("\n\n");
  const figures = more.map((p) => ({ kind: "image", title: { gu: "", en: "", hi: "" }, photo: p }));
  await sql.query(
    `insert into features (id, beat, status, headline, dek, body, caption, photo, author, sources, checks, figures, published_at, updated_at)
     values ($1, $2, 'published', $3, $4, $5, $6, $7, 'editor', '[]', $8, $9, now(), now())`,
    [id, x.beat, x.headline, x.deck, body, photo ? x.caption : "", photo ? JSON.stringify(photo) : null,
     JSON.stringify({ by: "editor", who: by, words: paras.join(" ").split(/\s+/).filter(Boolean).length }), JSON.stringify(figures)]);
  console.log(`article ${id} written by ${by}`);
  await touched(sql);
  return id;
}

/** A story taken down by mistake goes back up. */
export async function restoreStory(sql: Sql, id: string): Promise<boolean> {
  const done = await sql.query(`update stories set status = 'published', hold_reason = null, updated_at = now() where id = $1 and status = 'withdrawn' returning id`, [id]);
  if (done.length) await touched(sql);
  return done.length > 0;
}

// ---- what the editor changes ----

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
