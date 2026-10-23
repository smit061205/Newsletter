// Where the backend finds things. Fonts and images are served to the website
// from web/public, so the backend measures and checks with those same files.
//
// DATA_DIR (a persistent disk on a host such as Render) holds everything that
// must survive a redeploy: the SQLite database, built PDFs and page images,
// uploaded release photos, and the publications' licensed fonts. Unset, it
// all stays inside the repository, as on a developer's machine.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: on Windows that would be "/C:/..."
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PUBLIC_DIR = path.join(ROOT, "web", "public");
export const DATA_DIR = process.env.DATA_DIR?.trim() || "";
export const DB_FILE = DATA_DIR ? path.join(DATA_DIR, "capital-kranti.sqlite") : path.join(ROOT, "backend", "data", "capital-kranti.sqlite");
export const OUT_DIR = DATA_DIR ? path.join(DATA_DIR, "out") : path.join(ROOT, "out", "backend");
/** The AI key and other secrets (KEY=value lines): in DATA_DIR when set, so an
 * app update (which replaces the app's own folder) never loses them. */
export const ENV_FILE = process.env.CK_ENV_FILE?.trim() || (DATA_DIR ? path.join(DATA_DIR, "settings.env") : path.join(ROOT, "backend", ".env"));
/** Papers added in the newsroom ("Add a newspaper"): their profiles, fonts and
 * art in a folder an app update never replaces (CK_PAPERS_HOME, set by the app;
 * else beside the data), each paper's own data in papers/<id>/ there. */
export const PAPERS_HOME = process.env.CK_PAPERS_HOME?.trim() || DATA_DIR || ROOT;
/** A paper's folder: one added here, else one that ships with the code. */
export function publicationDir(id: string): string {
  const added = path.join(PAPERS_HOME, "publications", id);
  return existsSync(path.join(added, "profile.json")) ? added : path.join(ROOT, "publications", id);
}
/** Release photos, served as /media/<date>/<file>. */
export const MEDIA_DIR = process.env.CK_MEDIA_DIR?.trim() || (DATA_DIR ? path.join(DATA_DIR, "media") : path.join(PUBLIC_DIR, "media"));

/** The origin relative font/image URLs resolve against when the backend
 * plots pages itself (never fetched over the network: served from PUBLIC_DIR). */
export const PLOT_ORIGIN = "http://plot.local";

/** The file on disk behind a URL path in an issue: /private/<paper>/... is a
 * publication's own folder (licensed fonts -- read by the backend's browser
 * only, never served publicly), looked for on DATA_DIR first; /media/... is
 * MEDIA_DIR; everything else is the website's public folder. */
export function assetFile(pathname: string): string {
  const p = decodeURIComponent(pathname);
  const m = p.match(/^\/private\/([a-z0-9-]+)\/(.+)$/);
  if (m && !m[2].split("/").includes("..")) {
    const onDisk = DATA_DIR ? path.join(DATA_DIR, "publications", m[1], m[2]) : "";
    return onDisk && existsSync(onDisk) ? onDisk : path.join(publicationDir(m[1]), m[2]);
  }
  if (p.startsWith("/media/") && !p.split("/").includes("..")) return path.join(MEDIA_DIR, p.slice("/media/".length));
  return path.join(PUBLIC_DIR, p);
}
