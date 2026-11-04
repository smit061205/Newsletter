// Backups outside the app's own folder (Settings' backup folder; the
// Documents folder unless the editor chose another), so a broken computer or
// a removed app loses nothing that can't be made again. Every day one dated
// folder, in "<folder>/Capital Kranti backup/<YYYY-MM-DD>/", the last 30 kept:
//   capital-kranti.sqlite.gz   the paper's database (stories, issues, ad bookings, customers)
//   settings.env               the AI key and the Telegram bot
//   designs/, media/ads/       the customers' designs and the ads' pictures
//   publications/              papers added in the newsroom (profiles, fonts, art)
//   papers/<id>/...            each other paper's database, designs and ads
//   backup.json                written last: a folder without it is unfinished
// News photos and built PDFs are left out: the paper makes them again.
//
// A restore can't replace a database the engine has open, so the newsroom asks
// for it (restore.json beside the data), the engine stops, and the next engine
// puts the backup in place before it opens anything (restorePending, cli.ts).
// What it replaces is kept in backups/before-restore-<time>/.
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { DATA_DIR, ENV_FILE, PAPERS_HOME, ROOT } from "./config.ts";
import type { Store } from "./store.ts";

const KEEP = 30;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DB = "capital-kranti.sqlite";
/** The main paper's data folder, which holds the others' (papers/<id>/). */
const home = () => (PAPERS_HOME === ROOT ? path.join(ROOT, "backend", "data") : PAPERS_HOME);
const marker = () => path.join(home(), "restore.json");

/** The folder the editor chose, else the Documents folder (inside the app,
 * which passes it as CK_DOCUMENTS); "" when there's none (a developer's checkout). */
export function backupFolder(store: Store): string {
  return store.setting("backupFolder", "") || process.env.CK_DOCUMENTS?.trim() || "";
}
const dirOf = (folder: string) => path.join(folder, "Capital Kranti backup");

export interface BackupInfo { name: string; at: string; papers: string[]; bytes: number }
export interface BackupState { folder: string; last: { at: string; ok: boolean; error?: string } | null; list: BackupInfo[] }

/** What Settings shows: the folder, how the last backup went, the backups there (newest first). */
export async function backupState(store: Store): Promise<BackupState> {
  const folder = backupFolder(store);
  const list: BackupInfo[] = [];
  for (const name of folder ? await readdir(dirOf(folder)).catch(() => [] as string[]) : []) {
    if (!DAY.test(name)) continue;
    const m = await readFile(path.join(dirOf(folder), name, "backup.json"), "utf8").then((s) => JSON.parse(s) as BackupInfo).catch(() => null);
    if (m) list.push({ ...m, name });
  }
  list.sort((a, b) => b.name.localeCompare(a.name));
  // a restored database remembers the backups before its own: the newest one there counts too
  const saved = store.setting<BackupState["last"]>("backupLast", null);
  const last = list[0] && (!saved || saved.at < list[0].at) ? { at: list[0].at, ok: true } : saved;
  return { folder, last, list };
}

/** A database copied while the engine writes (VACUUM INTO is consistent), then gzipped. */
async function copyDb(file: string, to: string) {
  const plain = `${to}.tmp`;
  const db = new DatabaseSync(file, { readOnly: true });
  try { db.exec(`VACUUM INTO '${plain.replace(/'/g, "''")}'`); } finally { db.close(); }
  await pipeline(createReadStream(plain), createGzip(), createWriteStream(`${to}.gz`));
  await rm(plain);
}
const copyDir = async (from: string, to: string) => { if (existsSync(from)) await cp(from, to, { recursive: true }); };

/** One paper's data folder into a backup's folder. */
async function copyPaper(data: string, to: string) {
  await mkdir(to, { recursive: true });
  await copyDb(path.join(data, DB), path.join(to, DB));
  await copyDir(path.join(data, "designs"), path.join(to, "designs"));
  await copyDir(path.join(data, "media", "ads"), path.join(to, "media", "ads"));
}

/** Today's backup (`day`), made again when `again`; the oldest past 30 removed. */
export async function backUp(store: Store, day: string, opts: { again?: boolean; log: (s: string) => void }): Promise<BackupInfo | null> {
  const folder = backupFolder(store);
  if (!folder || !DATA_DIR) return null;
  const dir = dirOf(folder), done = path.join(dir, day);
  if (!opts.again && existsSync(path.join(done, "backup.json"))) return null;
  const work = path.join(dir, `.${day}.part`);
  try {
    if (!existsSync(folder)) throw new Error(`the folder isn't there (${folder})`);
    await rm(work, { recursive: true, force: true });
    await copyPaper(home(), work);
    const papers: string[] = [];
    for (const id of await readdir(path.join(home(), "papers")).catch(() => [] as string[])) {
      if (!/^[a-z0-9-]+$/.test(id) || !existsSync(path.join(home(), "papers", id, DB))) continue;
      await copyPaper(path.join(home(), "papers", id), path.join(work, "papers", id));
      papers.push(id);
    }
    if (existsSync(ENV_FILE)) await cp(ENV_FILE, path.join(work, "settings.env"));
    await copyDir(path.join(home(), "publications"), path.join(work, "publications"));
    const bytes = await size(work);
    const info: BackupInfo = { name: day, at: new Date().toISOString(), papers, bytes };
    await writeFile(path.join(work, "backup.json"), JSON.stringify(info, null, 2));
    await rm(done, { recursive: true, force: true });
    await rename(work, done);
    const old = (await readdir(dir)).filter((f) => DAY.test(f)).sort().slice(0, -KEEP);
    for (const f of old) await rm(path.join(dir, f), { recursive: true, force: true });
    store.putSetting("backupLast", { at: info.at, ok: true });
    opts.log(`backed up to ${done}`);
    return info;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    store.putSetting("backupLast", { at: new Date().toISOString(), ok: false, error });
    await rm(work, { recursive: true, force: true }).catch(() => {});
    opts.log(`backup to ${dir} failed: ${error}`);
    throw e;
  }
}
async function size(dir: string): Promise<number> {
  let n = 0;
  for (const f of await readdir(dir, { recursive: true, withFileTypes: true })) if (f.isFile()) n += (await stat(path.join(f.parentPath, f.name))).size;
  return n;
}

/** A restore asked for: put in place when the engine starts next. */
export async function askRestore(store: Store, name: string) {
  if (!DAY.test(name)) throw new Error("no such backup");
  const from = path.join(dirOf(backupFolder(store)), name);
  if (!existsSync(path.join(from, "backup.json"))) throw new Error("that backup isn't there any more");
  await writeFile(marker(), JSON.stringify({ from }));
}

/** At the engine's start, before the database opens: a restore asked for is
 * put in place, what it replaces kept aside. */
export async function restorePending(log: (s: string) => void) {
  const file = marker();
  if (!existsSync(file)) return;
  const { from } = JSON.parse(await readFile(file, "utf8")) as { from: string };
  // asked for once: a restore that fails isn't tried at every start
  await rm(file);
  if (!existsSync(path.join(from, "backup.json"))) return log(`restore: ${from} isn't there, nothing changed`);
  const aside = path.join(home(), "backups", `before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const put = async (src: string, data: string, keep: string) => {
    await mkdir(keep, { recursive: true });
    // the database with its journal: a restored file must never meet the old one's
    for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) if (existsSync(path.join(data, f))) await rename(path.join(data, f), path.join(keep, f));
    await mkdir(data, { recursive: true });
    await pipeline(createReadStream(path.join(src, `${DB}.gz`)), createGunzip(), createWriteStream(path.join(data, DB)));
    for (const sub of ["designs", path.join("media", "ads")]) {
      if (!existsSync(path.join(src, sub))) continue;
      if (existsSync(path.join(data, sub))) await cp(path.join(data, sub), path.join(keep, sub), { recursive: true });
      await rm(path.join(data, sub), { recursive: true, force: true });
      await cp(path.join(src, sub), path.join(data, sub), { recursive: true });
    }
  };
  await put(from, home(), aside);
  for (const id of await readdir(path.join(from, "papers")).catch(() => [] as string[])) {
    if (/^[a-z0-9-]+$/.test(id)) await put(path.join(from, "papers", id), path.join(home(), "papers", id), path.join(aside, "papers", id));
  }
  if (existsSync(path.join(from, "settings.env"))) {
    if (existsSync(ENV_FILE)) await cp(ENV_FILE, path.join(aside, "settings.env"));
    await cp(path.join(from, "settings.env"), ENV_FILE);
  }
  // added papers come back; ones added since stay
  await copyDir(path.join(from, "publications"), path.join(home(), "publications"));
  log(`restored the backup of ${path.basename(from)}; what it replaced is in ${aside}`);
}
