// The data folder kept to a size (Settings' "Free up space", and once a day by
// itself): what can be made again, or was handed over long ago, goes.
//   - a day's older versions (the last kept, and any approved), from 3 days back
//   - copies' and sister papers' PDFs after 30 days (the customers have them)
//   - page images after 30 days (the day's PDF stays, in Past issues)
//   - release and Telegram photos after 90 days (never the ads' pictures)
//   - the copy workers' databases (made again for each batch, editorial/copies.ts)
//   - the database compacted after rows went
// The day's own PDFs and the issues themselves are never touched.
import { existsSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, MEDIA_DIR, OUT_DIR, PAPERS_HOME, ROOT } from "./config.ts";
import type { Store } from "./store.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VERSIONS_FROM = 3, PDFS_FOR = 30, IMAGES_FOR = 30, PHOTOS_FOR = 90;
const home = () => (PAPERS_HOME === ROOT ? path.join(ROOT, "backend", "data") : PAPERS_HOME);

/** The India day `n` days before `day`. */
function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
/** How much a folder holds (bytes); 0 when it isn't there. */
export async function sizeOf(dir: string): Promise<number> {
  let n = 0;
  for (const f of await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])) {
    if (f.isFile()) n += await stat(path.join(f.parentPath, f.name)).then((s) => s.size, () => 0);
  }
  return n;
}
/** Dated folders in `dir` older than `before`, removed; the bytes freed. */
async function oldDays(dir: string, before: string): Promise<number> {
  let freed = 0;
  for (const d of await readdir(dir).catch(() => [] as string[])) {
    if (!DAY.test(d) || d >= before) continue;
    freed += await sizeOf(path.join(dir, d));
    await rm(path.join(dir, d), { recursive: true, force: true });
  }
  return freed;
}

/** What the data folder holds, for Settings. */
export async function space(): Promise<{ bytes: number }> {
  return { bytes: DATA_DIR ? await sizeOf(home()) : 0 };
}

/** One clean-up (`today` is India's day); `busy` when a run or a batch of copies is
 * going, which leaves the workers and the database as they are. The bytes freed. */
export async function tidy(store: Store, today: string, opts: { busy: boolean; log: (s: string) => void }): Promise<number> {
  if (!DATA_DIR) return 0;
  let freed = 0;
  // PDFs and images by the day they're for
  freed += await oldDays(path.join(OUT_DIR, "copies"), daysBefore(today, PDFS_FOR));
  freed += await oldDays(path.join(OUT_DIR, "editions"), daysBefore(today, PDFS_FOR));
  for (const paper of await readdir(path.join(OUT_DIR, "pages")).catch(() => [] as string[])) {
    freed += await oldDays(path.join(OUT_DIR, "pages", paper), daysBefore(today, IMAGES_FOR));
  }
  // release photos (media/<day>/), and the photos sent to the Telegram bot by when they came
  freed += await oldDays(MEDIA_DIR, daysBefore(today, PHOTOS_FOR));
  const tg = path.join(MEDIA_DIR, "telegram"), cutoff = Date.now() - PHOTOS_FOR * 86400_000;
  for (const f of await readdir(tg, { withFileTypes: true }).catch(() => [])) {
    if (!f.isFile()) continue;
    const st = await stat(path.join(tg, f.name)).catch(() => null);
    if (st && st.mtimeMs < cutoff) { freed += st.size; await rm(path.join(tg, f.name), { force: true }); }
  }
  if (!opts.busy) {
    // the copy workers: their useful part went into this database when each finished
    for (const paper of await readdir(path.join(home(), "papers")).catch(() => [] as string[])) {
      for (const w of await readdir(path.join(home(), "papers", paper)).catch(() => [] as string[])) {
        if (!/^worker-\d+$/.test(w)) continue;
        freed += await sizeOf(path.join(home(), "papers", paper, w));
        await rm(path.join(home(), "papers", paper, w), { recursive: true, force: true });
      }
    }
    // a day's earlier versions: the last kept, and the approved one
    const gone = store.db.prepare(`delete from issues where date < ? and status != 'approved'
      and version < (select max(version) from issues i where i.date = issues.date)`).run(daysBefore(today, VERSIONS_FROM));
    if (Number(gone.changes) > 0) {
      const file = path.join(DATA_DIR, "capital-kranti.sqlite");
      const before = existsSync(file) ? (await stat(file)).size : 0;
      store.db.exec("vacuum");
      freed += Math.max(0, before - (existsSync(file) ? (await stat(file)).size : 0));
    }
  }
  store.putSetting("tidied", { day: today, freed });
  opts.log(`cleared ${Math.round(freed / 1048576)} MB of old files`);
  return freed;
}
