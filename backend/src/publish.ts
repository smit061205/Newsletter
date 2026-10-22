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
import { existsSync } from "node:fs";
import { DATA_DIR, PUBLIC_DIR, ROOT } from "./config.ts";
import { pageImageDir, type BuildReport } from "./build.ts";
import type { Store } from "./store.ts";

// the website's issues: its own folder in a checkout; in the desktop app
// (DATA_DIR, no checkout) a working copy there, sent with GitHub's API
export const ISSUES_DIR = DATA_DIR ? path.join(DATA_DIR, "site", "issues") : path.join(PUBLIC_DIR, "issues");
/** Where the website keeps them in the repository. */
const SITE_PATH = "web/public/issues";

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

  if (opts.push && !existsSync(path.join(ROOT, ".git")) && process.env.GITHUB_TOKEN) {
    await pushWithApi(date, published.issueNumber, dates, log);
  } else if (opts.push) {
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

/** The day's issue to the website's repository as one commit through
 * GitHub's API (the desktop app has no Git): the day's files in, days the
 * site no longer keeps out. GITHUB_TOKEN comes from the app's one-time
 * "Connect the website" sign-in; GITHUB_REPO is owner/name. */
async function pushWithApi(date: string, issueNumber: number, keep: string[], log: (s: string) => void) {
  const repo = process.env.GITHUB_REPO?.trim() || "smit061205/Newsletter";
  const branch = process.env.GITHUB_BRANCH?.trim() || "main";
  const api = async <T>(p: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`https://api.github.com/repos/${repo}${p}`, {
      ...init, headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "CapitalKranti-newsroom",
                          ...(init.body ? { "content-type": "application/json" } : {}) },
    });
    if (!res.ok) throw new Error(`the website's repository answered ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return (await res.json()) as T;
  };
  const ref = await api<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
  const head = await api<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
  // the day's files, as blobs
  const entries: { path: string; mode: "100644"; type: "blob"; sha: string | null }[] = [];
  const upload = async (local: string, remote: string) => {
    const blob = await api<{ sha: string }>("/git/blobs", { method: "POST", body: JSON.stringify({ content: (await readFile(local)).toString("base64"), encoding: "base64" }) });
    entries.push({ path: remote, mode: "100644", type: "blob", sha: blob.sha });
  };
  for (const f of await readdir(path.join(ISSUES_DIR, date))) await upload(path.join(ISSUES_DIR, date, f), `${SITE_PATH}/${date}/${f}`);
  await upload(path.join(ISSUES_DIR, "index.json"), `${SITE_PATH}/index.json`);
  // the days the site no longer keeps, and old files of this day, removed
  const tree = await api<{ tree: { path: string; type: string }[] }>(`/git/trees/${head.tree.sha}?recursive=1`);
  const fresh = new Set(entries.map((e) => e.path));
  for (const t of tree.tree) {
    const m = t.path.match(new RegExp(`^${SITE_PATH}/(\\d{4}-\\d{2}-\\d{2})/`));
    if (t.type === "blob" && m && (!keep.includes(m[1]) || (m[1] === date && !fresh.has(t.path)))) entries.push({ path: t.path, mode: "100644", type: "blob", sha: null });
  }
  const newTree = await api<{ sha: string }>("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree: entries }) });
  const commit = await api<{ sha: string }>("/git/commits", { method: "POST",
    body: JSON.stringify({ message: `Publish issue ${issueNumber} (${date})`, tree: newTree.sha, parents: [ref.object.sha] }) });
  await api(`/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  log(`published to the website (${repo}@${commit.sha.slice(0, 7)}): it redeploys in a minute or so`);
}
