// Where the backend finds things. Fonts and images are served to the website
// from web/public, so the backend measures and checks with those same files.
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
export const PUBLIC_DIR = path.join(ROOT, "web", "public");
export const OUT_DIR = path.join(ROOT, "out", "backend");

/** The origin relative font/image URLs resolve against when the backend
 * plots pages itself (never fetched over the network: served from PUBLIC_DIR). */
export const PLOT_ORIGIN = "http://plot.local";

/** The file on disk behind a URL path in an issue: /private/<paper>/... is a
 * publication's own folder (licensed fonts -- read by the backend's browser
 * only, never served publicly); everything else is the website's public folder. */
export function assetFile(pathname: string): string {
  const p = decodeURIComponent(pathname);
  const m = p.match(/^\/private\/([a-z0-9-]+)\/(.+)$/);
  if (m && !m[2].split("/").includes("..")) return path.join(ROOT, "publications", m[1], m[2]);
  return path.join(PUBLIC_DIR, p);
}
