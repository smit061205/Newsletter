// What a build is made from, as one hash: the day's stories, edits, ads and
// releases, the publication (profile, chrome, fonts) and the engine's own
// code. Two builds with the same fingerprint must produce the same issue
// (gate 7); builds with different ones can't be compared at all -- a new
// version of the engine is meant to change the paper.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";
import { PROFILE_DIR } from "./profile.ts";
import type { Store } from "./store.ts";

/** Every file under `dir`, sorted, into the hash. */
function hashTree(h: ReturnType<typeof createHash>, dir: string) {
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) hashTree(h, file);
    else h.update(`${path.relative(ROOT, file)}\0`).update(readFileSync(file));
  }
}

export function buildFingerprint(store: Store, date: string): string {
  const h = createHash("sha256");
  h.update(JSON.stringify({
    stories: store.stories(date), edits: store.edits(date), ads: store.ads(date), releases: store.releases(date),
  }));
  hashTree(h, path.join(ROOT, "backend", "src"));
  hashTree(h, path.join(ROOT, "shared", "src"));
  hashTree(h, PROFILE_DIR);
  return h.digest("hex").slice(0, 16);
}
