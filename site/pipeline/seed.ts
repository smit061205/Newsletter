// Loads the days published before the website existed (20-22 Oct 2026,
// issues 269-271) into it, once: their stories and photos from
// site/pipeline/seed/<date>.json (exported with the newsroom's own Publish,
// backend/src/publish-site.ts), their e-paper from the repository's page images
// (web/public/issues/<date>). A day already there with its e-paper is left
// alone, so running it again costs no uploads.
// Run: node --experimental-strip-types site/pipeline/seed.ts   (DATABASE_URL, BLOB_READ_WRITE_TOKEN)
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { ensureSchema } from "../lib/schema.ts";
import type { PublishPayload } from "../lib/types.ts";
import { count, saveIssue } from "../lib/write.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const sql = neon(process.env.DATABASE_URL ?? "");
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 10);
// the photo store is private: the site serves its files at /media/<name> (app/media)
const upload = async (name: string, data: Buffer | Uint8Array, contentType: string) => {
  await put(name, Buffer.from(data), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
  await count(sql, "upload");
  return `/media/${name}`;
};

type Seed = Omit<PublishPayload, "stories"> & { stories: (Omit<PublishPayload["stories"][number], "photo"> & { photo: null | { data: string; path: string; width: number; height: number } })[] };

await ensureSchema(sql);
// the run is recorded (kind "seed"), its error included, so /api/status shows what happened
const [run] = await sql.query(`insert into runs (kind) values ('seed') returning id`);
const done: string[] = [];
let step = "starting";
try {
for (const file of readdirSync(path.join(HERE, "seed")).filter((f) => f.endsWith(".json")).sort()) {
  const seed = JSON.parse(readFileSync(path.join(HERE, "seed", file), "utf8")) as Seed;
  const date = seed.issue.date;
  step = `${date}: checking`;
  const [have] = await sql.query(`select jsonb_array_length(pages) as pages from issues where date = $1`, [date]);
  if (have?.pages > 0) { console.log(`${date}: already on the website`); continue; }

  step = `${date}: uploading photos`;
  const stories: PublishPayload["stories"] = [];
  for (const s of seed.stories) {
    const photo = s.photo ? { url: await upload(s.photo.path, Buffer.from(s.photo.data, "base64"), "image/jpeg"), width: s.photo.width, height: s.photo.height } : null;
    stories.push({ ...s, photo });
  }
  // the e-paper: the printed pages at 1400 px, and a PDF of them
  step = `${date}: e-paper pages`;
  const dir = path.join(ROOT, "web", "public", "issues", date);
  const pages: PublishPayload["issue"]["pages"] = [];
  const doc = await PDFDocument.create();
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const src = path.join(dir, `${n}.jpg`);
    if (!existsSync(src)) continue;
    const { data, info } = await sharp(src).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    pages.push({ number: n, url: await upload(`epaper/${date}/${n}-${hash(data)}.jpg`, data, "image/jpeg"), width: info.width, height: info.height });
    const img = await doc.embedJpg(data);
    doc.addPage([info.width * 0.75, info.height * 0.75]).drawImage(img, { x: 0, y: 0, width: info.width * 0.75, height: info.height * 0.75 });
  }
  const pdfBytes = await doc.save();
  const pdf = pages.length ? await upload(`epaper/${date}/capital-kranti-${date}-${hash(pdfBytes)}.pdf`, pdfBytes, "application/pdf") : null;
  // published that evening, at 8:30 pm India time
  step = `${date}: saving the stories`;
  await saveIssue(sql, { issue: { ...seed.issue, pages, pdf }, stories }, `${date}T15:00:00.000Z`);
  console.log(`${date}: ${stories.length} stories, ${stories.filter((s) => s.photo).length} photos, ${pages.length} e-paper pages`);
  done.push(date);
}
} catch (e) {
  const error = `${step}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`.slice(0, 600);
  console.error(error);
  await sql.query(`update runs set finished_at = now(), ok = false, details = $2 where id = $1`, [run.id, JSON.stringify({ done, error })]);
  process.exit(1);
}
await sql.query(`update runs set finished_at = now(), ok = true, details = $2 where id = $1`, [run.id, JSON.stringify({ done })]);
const refreshed = await fetch("https://capital-kranti.vercel.app/api/refresh", { method: "POST" }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
console.log(`website refresh: ${JSON.stringify(refreshed)}`);
