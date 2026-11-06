// The 8-page paper's pages as pictures, for the Paper screen's "8 pages" (the developer,
// 6 Nov): drawn from its laid-out pages (pipeline.ts "sections" keeps them) the first time
// they're asked for, and kept beside the day's own page pictures (cleared with them, tidy.ts)
// until the 8-page paper is made again.
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { printIssue } from "@ck/shared/pdf";
import type { IssueRender } from "@ck/shared/contract";
import { acquireBrowser, releaseBrowser } from "../browser.ts";
import { pageImageDir } from "../build.ts";
import { assetFile, PLOT_ORIGIN } from "../config.ts";

// (one drawing at a time per day: the thumbnails ask for every page at once)
const drawing = new Map<string, Promise<void>>();

/** Page `n` of the day's 8-page paper as a PNG (`json`: its laid-out pages), or null. */
export async function eightPageImage(date: string, n: number, json: string): Promise<Buffer | null> {
  const dir = path.join(pageImageDir(date), "eight");
  // (made again since they were drawn: drawn again)
  const made = String((await stat(json)).mtimeMs);
  const stamp = path.join(dir, "made");
  const fresh = existsSync(stamp) && (await readFile(stamp, "utf8")) === made;
  if (!fresh) {
    let job = drawing.get(date);
    if (!job) {
      job = (async () => {
        const issue = JSON.parse(await readFile(json, "utf8")) as IssueRender;
        const browser = await acquireBrowser();
        let images: Buffer[] | undefined;
        try {
          images = (await printIssue(issue, { origin: PLOT_ORIGIN, resolve: assetFile, browser, images: 150 })).images as Buffer[] | undefined;
        } finally { releaseBrowser(); }
        await rm(dir, { recursive: true, force: true });
        await mkdir(dir, { recursive: true });
        await Promise.all((images ?? []).map((png, i) => writeFile(path.join(dir, `${i + 1}.png`), png)));
        await writeFile(stamp, made);
      })().finally(() => drawing.delete(date));
      drawing.set(date, job);
    }
    await job;
  }
  const file = path.join(dir, `${n}.png`);
  return existsSync(file) ? readFile(file) : null;
}
