// Where the backend finds things. Fonts and images are served to the website
// from web/public, so the backend measures and checks with those same files.
//
// DATA_DIR (a persistent disk on a host such as Render) holds everything that
// must survive a redeploy: the SQLite database, built PDFs and page images,
// uploaded release photos, and the publications' licensed fonts. Unset, it
// all stays inside the repository, as on a developer's machine.
import { existsSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
export const PUBLIC_DIR = path.join(ROOT, "web", "public");
export const DATA_DIR = process.env.DATA_DIR?.trim() || "";
export const DB_FILE = DATA_DIR ? path.join(DATA_DIR, "capital-kranti.sqlite") : path.join(ROOT, "backend", "data", "capital-kranti.sqlite");
export const OUT_DIR = DATA_DIR ? path.join(DATA_DIR, "out") : path.join(ROOT, "out", "backend");
/** Release photos, served as /media/<date>/<file>. */
export const MEDIA_DIR = DATA_DIR ? path.join(DATA_DIR, "media") : path.join(PUBLIC_DIR, "media");

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
    return onDisk && existsSync(onDisk) ? onDisk : path.join(ROOT, "publications", m[1], m[2]);
  }
  if (p.startsWith("/media/") && !p.split("/").includes("..")) return path.join(MEDIA_DIR, p.slice("/media/".length));
  return path.join(PUBLIC_DIR, p);
}
