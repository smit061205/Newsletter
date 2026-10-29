// Step 6 (ROADMAP §3): a written, checked story into the website's database,
// live at once or held for the editor, with its official photo (only an
// official source's, §2) in the photo store and every source it came from.
import { createHash } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { WEBSITE } from "../lib/config.ts";
import type { English, Photo, Tier } from "../lib/types.ts";
import { count } from "../lib/write.ts";
import { UA } from "./fetch.ts";
import type { Checked, SourceText, Written } from "./newsroom.ts";

type Sql = NeonQueryFunction<false, false>;

/** India's date now (a live story belongs to the day it went up, India time). */
export const indiaDate = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** An official photo, made 1200 px wide, into the private photo store (the site serves it at /media/...). */
export async function photoOf(sql: Sql, src: SourceText[], storyId: string): Promise<Photo | null> {
  const url = src.find((s) => s.official && s.image)?.image;
  return url ? storePhoto(sql, url, storyId) : null;
}

/** A photo fetched, made 1200 px wide (an Aavtikal cover 1920, 30 Oct) and kept in the photo store; null when it's too
 *  small or the day's uploads are used up. */
export async function storePhoto(sql: Sql, url: string, storyId: string, ua = UA, width = 1200): Promise<Photo | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  if ((await count(sql, "upload", 0)) >= WEBSITE.dailyUploads) return null;
  try {
    const res = await fetch(url, { headers: { "user-agent": ua }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return await storeImage(sql, Buffer.from(await res.arrayBuffer()), storyId, width);
  } catch {
    return null;
  }
}

/** An image already in hand (Aavtikal's drawn covers, engine/drawn.ts) made a JPEG and kept in the photo store, as storePhoto. */
export async function storeImage(sql: Sql, image: Buffer, storyId: string, width = 1200): Promise<Photo | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  if ((await count(sql, "upload", 0)) >= WEBSITE.dailyUploads) return null;
  try {
    const { data, info } = await sharp(image).rotate()
      .resize({ width, withoutEnlargement: true }).jpeg({ quality: width > 1200 ? 82 : 78, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    if (info.width < 400 || info.height < 220) return null; // an icon or a banner strip
    const name = `live/${indiaDate()}/${storyId}-${createHash("sha256").update(data).digest("hex").slice(0, 10)}.jpg`;
    await put(name, data, { access: "private", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
    await count(sql, "upload");
    return { url: `/media/${name}`, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export interface LiveStory {
  id: string; tier: Tier; genres: string[]; written: Written; checked: Checked; src: SourceText[];
  importance: number; status: "published" | "held"; holdReason: string | null;
  en: English | null; hi: English | null; translated: boolean; photo: Photo | null;
}

export async function saveLive(sql: Sql, s: LiveStory) {
  const primary = s.src[0];
  const sources = s.src.map((x) => ({ name: x.source.name, url: x.url, trust: x.source.trust, group: x.source.group }));
  const checks = { problems: s.checked.problems, claims: s.checked.claims, checker: s.checked.model ?? null, writer: s.written.model };
  await sql.query(
    `insert into stories (id, origin, issue_date, published_at, updated_at, tier, genres, tag_status, kicker, headline, deck, body, caption,
                          photo, source, checked, en, en_status, hi, hi_status, status, importance, sources, checks, hold_reason)
     values ($1, 'live', $2, now(), now(), $3, $4, 'done', $5, $6, $7, $8, $9, $10, $11, true, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     on conflict (id) do nothing`,
    [s.id, indiaDate(), s.tier, s.genres, s.written.kicker, s.written.headline, s.written.deck, s.written.body, s.photo ? s.written.caption : "",
     s.photo ? JSON.stringify(s.photo) : null,
     JSON.stringify({ kind: primary.url.includes("pib.gov.in") ? "pib" : "other", name: primary.source.name, url: primary.url }),
     s.en ? JSON.stringify(s.en) : null, s.translated ? (s.en ? "done" : "failed") : "skipped",
     s.hi ? JSON.stringify(s.hi) : null, s.translated ? (s.hi ? "done" : "failed") : "none",
     s.status, s.importance, JSON.stringify(sources), JSON.stringify(checks), s.holdReason]);
}
