// Step 1, the watchers (ROADMAP §3): every source asked what's new, politely,
// several sites at a time (one request at a time per site, fetch.ts). New
// items are saved once each, by their link. On a source's first reading its
// older items are only noted, so the engine starts from what's new.
import { createHash } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { ask } from "./fetch.ts";
import { parseFeed, type FeedItem } from "./feed.ts";
import { pibList } from "./pib.ts";
import { SOURCES, type SourceDef } from "./sources.ts";

type Sql = NeonQueryFunction<false, false>;
export const itemId = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 16);

/** How old an item may be and still be news (older ones are noted, not used). */
const FRESH_H = 18;
/** At most this many of a source's items a run (its newest). */
const PER_SOURCE = 40;
/** A source failing this many times in a row is asked only every 6 hours. */
const RESTING_AFTER = 6;

export interface Reading { source: SourceDef; status: number; refused: boolean; items: FeedItem[]; error?: string; notModified?: boolean; listed?: number }

/** One source's items now (no database): what probe.ts and the run both use. */
export async function read(s: SourceDef, since: { etag?: string | null; lastModified?: string | null } = {}): Promise<Reading & { etag?: string; lastModified?: string }> {
  if (s.url.startsWith("pib:")) {
    const r = await pibList(s.url.slice(4) as "gu" | "en" | "hi");
    return { source: s, ...r };
  }
  const res = await ask(s.url, since);
  if (res.status === 304) return { source: s, status: 304, refused: false, items: [], notModified: true };
  if (res.status !== 200) return { source: s, status: res.status, refused: res.refused, items: [], error: res.error };
  const all = parseFeed(res.text, res.url);
  const items = all.filter((it) => ownItem(s, it.url));
  return { source: s, status: 200, refused: false, items, listed: all.length, etag: res.etag, lastModified: res.lastModified };
}

/** An item is the source's own when it lives on one of the source's hosts (§3.1 step 2). */
export function ownItem(s: SourceDef, url: string): boolean {
  try {
    const host = new URL(url).host.replace(/^www\./, "");
    return s.hosts.some((h) => { const k = h.replace(/^www\./, ""); return host === k || host.endsWith(`.${k}`); });
  } catch {
    return false;
  }
}

async function pool<T>(list: T[], n: number, job: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) await job(list[i++]); }));
}

export interface CollectResult { asked: number; answered: number; newItems: number; refused: string[]; failing: string[] }

export async function collect(sql: Sql, log: (s: string) => void, deadline: number): Promise<CollectResult> {
  const states = new Map((await sql.query(`select * from sources_state`)).map((r) => [r.id as string, r]));
  const now = Date.now();
  const due = SOURCES.filter((s) => {
    const st = states.get(s.id);
    if (!st) return true;
    // a source that refused us is asked again only once a day (politely, the same way: never worked around)
    if (st.refused) return now - Date.parse(st.checked_at as string) > 24 * 3600_000;
    if ((st.failures as number) >= RESTING_AFTER) return now - Date.parse(st.checked_at as string) > 6 * 3600_000;
    return true;
  });
  const out: CollectResult = { asked: due.length, answered: 0, newItems: 0, refused: [], failing: [] };
  await pool(due, 8, async (s) => {
    if (Date.now() > deadline) return;
    const st = states.get(s.id);
    const first = !st || !st.ok_at;
    const r = await read(s, { etag: st?.etag as string | null, lastModified: st?.last_modified as string | null });
    const ok = r.status === 200 || r.status === 304;
    await sql.query(
      `insert into sources_state (id, etag, last_modified, checked_at, ok_at, status, failures, refused, note)
       values ($1, $2, $3, now(), case when $4 then now() end, $5, case when $4 then 0 else 1 end, $6, $7)
       on conflict (id) do update set etag = coalesce(excluded.etag, sources_state.etag),
         last_modified = coalesce(excluded.last_modified, sources_state.last_modified), checked_at = now(),
         ok_at = coalesce(excluded.ok_at, sources_state.ok_at), status = excluded.status,
         failures = case when $4 then 0 else sources_state.failures + 1 end, refused = excluded.refused, note = excluded.note`,
      [s.id, r.etag ?? null, r.lastModified ?? null, ok, r.status, r.refused, r.error ?? null]);
    if (r.refused) { out.refused.push(s.id); return; }
    if (!ok) { out.failing.push(`${s.id} (${r.status || r.error})`); return; }
    out.answered++;
    for (const it of r.items.slice(0, PER_SOURCE)) {
      const old = it.publishedAt && now - Date.parse(it.publishedAt) > FRESH_H * 3600_000;
      // some feeds put India's time with a GMT label (the RBI's: 2 hours ahead); beyond 6 hours it's wrong
      const future = it.publishedAt && Date.parse(it.publishedAt) - now > 6 * 3600_000;
      // the first reading of a source, an old item, a date in the future: noted, never used
      const skip = first ? "first reading" : old ? "old" : future ? "dated in the future" : null;
      const rows = await sql.query(
        `insert into items (id, source, url, title, summary, lang, published_at, image, triage)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do nothing returning id`,
        [itemId(it.url), s.id, it.url, it.title.slice(0, 500), it.summary, s.lang,
         it.publishedAt && Date.parse(it.publishedAt) > now ? new Date(now).toISOString() : it.publishedAt, it.image,
         skip ? JSON.stringify({ skipped: skip }) : null]);
      if (rows.length && !skip) out.newItems++;
    }
  });
  if (out.refused.length) log(`  refused us (switched off, never worked around): ${out.refused.join(", ")}`);
  log(`  ${out.answered} of ${out.asked} sources answered; ${out.newItems} new item(s)`);
  return out;
}
