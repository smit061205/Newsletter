// Publishes a built issue to the website as plain files, for a website with no
// backend to call (web BACKEND_API_MODE=static, e.g. on Vercel's free plan):
//
//   web/public/issues/<date>/issue.json   what the site shows: date, number, page sizes, gates, warnings
//   web/public/issues/<date>/<n>.jpg      each page as an image (the licensed fonts never leave this machine)
//   web/public/issues/<date>/issue.pdf    the print PDF
//   web/public/issues/index.json          the published days, newest first
//
// Commit and push those files (--push does it) and the website redeploys.
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { PUBLIC_DIR, ROOT } from "./config.ts";
import { pageImageDir, type BuildReport } from "./build.ts";
import type { Store } from "./store.ts";

export const ISSUES_DIR = path.join(PUBLIC_DIR, "issues");

/** What web/src/lib/published.ts reads. */
export interface PublishedIssue {
  issueDate: string;
  issueNumber: number;
  version: number;
  publishedAt: string;
  ready: boolean;
  pages: { number: number; width: number; height: number; image: string }[];
  dpi: number;
  pdf: string;
  gates: BuildReport["gates"];
  warnings: BuildReport["warnings"];
}

/** PNG page images as JPEGs: a fraction of the size, for a repository that
 * keeps every published day. */
async function toJpegs(pngs: string[], outs: string[], quality: number) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const [i, file] of pngs.entries()) {
      const b64 = (await readFile(file)).toString("base64");
      await page.setContent(`<style>html,body{margin:0}img{display:block}</style><img src="data:image/png;base64,${b64}">`);
      const size = await page.$eval("img", (img) => ({ width: (img as HTMLImageElement).naturalWidth, height: (img as HTMLImageElement).naturalHeight }));
      await page.setViewportSize(size);
      await writeFile(outs[i], await page.screenshot({ type: "jpeg", quality, clip: { x: 0, y: 0, ...size } }));
    }
  } finally {
    await browser.close();
  }
}

export async function publishIssue(store: Store, date: string, opts: {
  log: (s: string) => void; force?: boolean; keep?: number; push?: boolean; quality?: number;
}): Promise<PublishedIssue> {
  const { log } = opts;
  const got = store.latestIssue(date);
  if (!got) throw new Error(`no issue built for ${date}: run "build --date ${date}" first`);
  const report = got.report as BuildReport;
  if (!report.ready && !opts.force) {
    throw new Error(`issue ${date} v${got.version} is NOT READY (see its gates); fix it, or publish anyway with --force`);
  }
  const { issue } = got;
  const dir = path.join(ISSUES_DIR, date);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const numbers = issue.pages.map((p) => p.number).sort((a, b) => a - b);
  await toJpegs(numbers.map((n) => path.join(pageImageDir(date), `${n}.png`)), numbers.map((n) => path.join(dir, `${n}.jpg`)),
                opts.quality ?? 82);
  await copyFile(report.pdf, path.join(dir, "issue.pdf"));

  const published: PublishedIssue = {
    issueDate: date, issueNumber: issue.issueNumber, version: got.version, publishedAt: new Date().toISOString(),
    ready: report.ready, dpi: issue.dpi, pdf: `/issues/${date}/issue.pdf`,
    pages: issue.pages.map((p) => ({ number: p.number, width: p.width, height: p.height, image: `/issues/${date}/${p.number}.jpg` }))
      .sort((a, b) => a.number - b.number),
    gates: report.gates, warnings: report.warnings,
  };
  await writeFile(path.join(dir, "issue.json"), JSON.stringify(published, null, 1));

  // the published days, newest first; only the last `keep` stay on the site
  let dates = (await readdir(ISSUES_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)).map((d) => d.name).sort().reverse();
  const keep = opts.keep ?? 14;
  for (const old of dates.slice(keep)) {
    await rm(path.join(ISSUES_DIR, old), { recursive: true, force: true });
    log(`  removed ${old} from the site (keeping the last ${keep} days)`);
  }
  dates = dates.slice(0, keep);
  await writeFile(path.join(ISSUES_DIR, "index.json"), JSON.stringify({ latest: dates[0], dates }, null, 1));
  log(`published ${date} v${got.version} (${report.ready ? "READY" : "NOT READY, forced"}) -> ${path.relative(ROOT, dir)}`);

  if (opts.push) {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, stdio: "inherit" });
    git("add", "-A", path.relative(ROOT, ISSUES_DIR));
    git("commit", "-m", `Publish issue ${published.issueNumber} (${date})`);
    git("push");
    log("pushed: the website redeploys with it");
  } else {
    log(`to put it online: git add web/public/issues && git commit -m "Publish ${date}" && git push`);
  }
  return published;
}
