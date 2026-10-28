// Publishes Aavtikal's articles from site/pipeline/features/<date>.json (lib/flagship.ts):
// each photo is copied from where it came from (Wikimedia Commons, credited in
// its caption) into the website's own photo store, and the article saved as
// published. An article already there is left alone, so running it again costs nothing.
// Run: node --experimental-strip-types site/pipeline/features.ts   (DATABASE_URL, BLOB_READ_WRITE_TOKEN)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { ensureSchema } from "../lib/schema.ts";
import { count } from "../lib/write.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL ?? "");
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 10);

interface Raw { id: string; beat: string; author: string; photo: { url: string } | null; headline: string; dek: string; caption: string; body: string; en: unknown; sources: unknown[] }

await ensureSchema(sql);
const [run] = await sql.query(`insert into runs (kind) values ('features') returning id`);
const done: string[] = [];
let step = "starting";
try {
  for (const file of readdirSync(path.join(HERE, "features")).filter((f) => f.endsWith(".json")).sort()) {
    const list = JSON.parse(readFileSync(path.join(HERE, "features", file), "utf8")) as Raw[];
    // the first in the file is the newest; the rest a day or so apart before it
    const start = Date.parse(`${file.slice(0, 10)}T06:00:00Z`);
    for (const [i, a] of list.entries()) {
      step = `${a.id}: checking`;
      if ((await sql.query(`select 1 from features where id = $1`, [a.id])).length) { console.log(`${a.id}: already on the website`); continue; }
      let photo = null;
      if (a.photo) {
        step = `${a.id}: copying the photo`;
        const res = await fetch(a.photo.url, { headers: { "User-Agent": "CapitalKrantiSite/1.0 (https://capital-kranti.vercel.app)" } });
        if (!res.ok) throw new Error(`photo answered ${res.status}`);
        const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1600, withoutEnlargement: true })
          .jpeg({ quality: 78, mozjpeg: true }).toBuffer({ resolveWithObject: true });
        const name = `aavtikal/${a.id}-${hash(data)}.jpg`;
        await put(name, data, { access: "private", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
        await count(sql, "upload");
        photo = { url: `/media/${name}`, width: info.width, height: info.height };
      }
      step = `${a.id}: saving`;
      const at = new Date(start - i * 26 * 3600_000).toISOString();
      await sql.query(
        `insert into features (id, beat, status, headline, dek, body, caption, photo, author, en, sources, published_at, updated_at)
         values ($1, $2, 'published', $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) on conflict (id) do nothing`,
        [a.id, a.beat, a.headline, a.dek, a.body, a.caption, photo ? JSON.stringify(photo) : null, a.author, JSON.stringify(a.en), JSON.stringify(a.sources), at]);
      console.log(`${a.id}: published`);
      done.push(a.id);
    }
  }
} catch (e) {
  const error = `${step}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`.slice(0, 600);
  console.error(error);
  await sql.query(`update runs set finished_at = now(), ok = false, details = $2 where id = $1`, [run.id, JSON.stringify({ done, error })]);
  process.exit(1);
}
await sql.query(`update runs set finished_at = now(), ok = true, details = $2 where id = $1`, [run.id, JSON.stringify({ done })]);
if (done.length) {
  // the website renews its kept-ready pages when the content has changed
  await sql.query(`insert into state (key, value) values ('content_changed_at', now()::text) on conflict (key) do update set value = excluded.value`);
  const refreshed = await fetch("https://capital-kranti.vercel.app/api/refresh", { method: "POST" }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  console.log(`website refresh: ${JSON.stringify(refreshed)}`);
}
