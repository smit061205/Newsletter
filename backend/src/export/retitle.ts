// The date and issue number (અંક) on the paper's title, changed after it's made (the developer,
// 13 Nov: "give me the power to change date and aank no in the title after the paper is built"):
// kept for the day (a number for the days after it too: build.ts issueNumberFor), and the day's
// paper and its 8-page paper dressed with them where they stand -- their title's date and number
// set again, their PDFs and page pictures printed again -- not laid out again.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { printIssue } from "@ck/shared/pdf";
import type { Element, IssueRender } from "@ck/shared/contract";
import { acquireBrowser, releaseBrowser } from "../browser.ts";
import { issueNumberFor, pageImageDir, titleDateOf, type IssueFrom } from "../build.ts";
import { chromeFor, printedDate } from "../chrome/chrome.ts";
import { assetFile, outFile, PLOT_ORIGIN } from "../config.ts";
import { Measurer } from "../layout/measure.ts";
import { FACES, FONTS } from "../layout/typography.ts";
import type { Store } from "../store.ts";

/** What the day's title carries, and what it would without the editor's say. */
export function titleOf(store: Store, date: string) {
  return { date: titleDateOf(store, date), issue: issueNumberFor(date, store), auto: { date: printedDate(date), issue: issueNumberFor(date) } };
}

/** The editor's date and number for the day's title kept: the date for this day alone, the
 * number for this day and those after it (the days after count on from it). */
export function setTitle(store: Store, date: string, want: { date?: string; issue?: number }): string | null {
  if (want.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(want.date)) return "not a date";
  if (want.issue !== undefined && !(Number.isInteger(want.issue) && want.issue > 0)) return "not an issue number";
  if (want.date !== undefined) store.putSetting(`titleDate|${date}`, want.date === printedDate(date) ? null : want.date);
  if (want.issue !== undefined && want.issue !== issueNumberFor(date, store)) {
    const printed = printedDate(date);
    store.putSetting("issueFrom", [...store.setting<IssueFrom[]>("issueFrom", []).filter((x) => x.printed !== printed), { printed, number: want.issue }]);
  }
  return null;
}

/** The day's saved paper (and its 8-page paper) given the title's date and number as they now
 * are: the title's own fields set again in place, the PDFs and page pictures printed again. */
export async function retitle(store: Store, date: string, log: (s: string) => void = () => {}): Promise<boolean> {
  const got = store.latestIssue(date);
  if (!got) return false;
  const { date: printed, issue: number } = titleOf(store, date);
  const m = await Measurer.open(FONTS, FACES);
  // (only the date and number: the rest of each page as it was laid out)
  const dress = async (issue: IssueRender): Promise<IssueRender> => {
    const pages = [];
    for (const p of issue.pages) {
      const fresh = new Map((await chromeFor(p.number, issue.pages.length, date, number, m, { printed })).elements.map((e) => [e.id, e]));
      const swap = (e: Element) => (/^p\d+-(issue|date)$/.test(e.id) && fresh.has(e.id) ? fresh.get(e.id)! : e);
      pages.push({ ...p, elements: p.elements.map(swap) });
    }
    return { ...issue, issueNumber: number, pages };
  };
  const print = async (issue: IssueRender, pdfFile: string, imageDir?: string) => {
    const browser = await acquireBrowser();
    let printed: Awaited<ReturnType<typeof printIssue>>;
    try { printed = await printIssue(issue, { origin: PLOT_ORIGIN, resolve: assetFile, browser, ...(imageDir ? { images: 150 } : {}) }); }
    finally { releaseBrowser(); }
    await writeFile(pdfFile, printed.pdf);
    if (imageDir && printed.images) await Promise.all(printed.images.map((png, i) => writeFile(path.join(imageDir, `${i + 1}.png`), png)));
  };
  const issue = await dress(got.issue);
  const report = { ...(got.report as Record<string, unknown>), issueNumber: number, titledAt: new Date().toISOString() };
  store.db.prepare("update issues set json = ?, report = ? where date = ? and version = ?").run(JSON.stringify(issue), JSON.stringify(report), date, got.version);
  const pdf = (got.report as { pdf?: string }).pdf;
  if (pdf) await print(issue, outFile(pdf), existsSync(path.join(pageImageDir(date), "1.png")) ? pageImageDir(date) : undefined);
  log(`  the title: ${printed}, issue ${number}`);
  // the 8-page paper made from this version (its page pictures are drawn again from its pages: eight-images.ts)
  const eight = store.setting<{ version: number; pdf: string; json?: string } | null>(`eightPages|${date}`, null);
  if (eight?.json && eight.version === got.version && existsSync(outFile(eight.json))) {
    const eightIssue = await dress(JSON.parse(await readFile(outFile(eight.json), "utf8")) as IssueRender);
    await writeFile(outFile(eight.json), JSON.stringify(eightIssue));
    await print(eightIssue, outFile(eight.pdf));
  }
  return true;
}
