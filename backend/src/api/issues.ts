// The day's paper: the issue and its versions, its PDFs, page images and SVGs,
// the editor's edits and articles, its stories, and the runs that make it
// (pipeline.ts) with their live log.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { outFile, ROOT } from "../config.ts";
import { currentJob, onJob, STEPS } from "../pipeline.ts";
import type { StepName } from "../store.ts";
import { sendEditable } from "./copies.ts";
import { readJson, send, type Ctx } from "./http.ts";
import { SisterStore, sisterOut, textEdit } from "../sister.ts";
import { frameFor, frameInfo, removeFrame, saveFrame, withFrame } from "../export/frame.ts";
import { copiesNow } from "./runs.ts";

export async function issuesRoutes(c: Ctx) {
  const { store, log, req, res, url, parts, startJob, later } = c;
  // (a sister paper worked on as its own: sister.ts)
  const sister = store instanceof SisterStore ? store : null;
  if (req.method === "GET" && url.pathname === "/api/issue") {
    const date = url.searchParams.get("date") ?? store.latestDate();
    const got = date ? store.latestIssue(date) : null;
    return got ? send(res, 200, got.issue) : send(res, 404, { error: `no issue built for ${date ?? "any day"}` });
  }
  if (req.method === "GET" && url.pathname === "/api/issues") {
    // the archive: every day built, newest first, its latest version
    const rows = store.db.prepare("select date, max(version) v from issues group by date order by date desc limit 120").all() as { date: string; v: number }[];
    return send(res, 200, rows.map((row) => {
      const got = store.latestIssue(row.date)!;
      const rep = got.report as { issueNumber?: number; ready?: boolean; cost?: number; placed?: unknown[]; pages?: number };
      return { date: row.date, version: got.version, status: got.status, issueNumber: rep.issueNumber, ready: rep.ready,
               cost: rep.cost, stories: rep.placed?.length ?? 0, pages: rep.pages };
    }));
  }
  if (parts[0] === "api" && parts[1] === "issues" && parts[2]) {
    const date = parts[2];
    if (req.method === "GET" && parts.length === 3) {
      const got = store.latestIssue(date);
      // (the 8-page paper, when it was made from this version of the day's)
      const eight = store.setting<{ version: number; pdf: string; json?: string; ready: boolean } | null>(`eightPages|${date}`, null);
      const made = !!eight && eight.version === got?.version && existsSync(outFile(eight.pdf));
      return got ? send(res, 200, { date, version: got.version, status: got.status, report: got.report,
                                    eight: made, eightEditable: made && !!eight!.json && existsSync(outFile(eight!.json)) })
                 : send(res, 404, { error: `no issue built for ${date}` });
    }
    if (req.method === "GET" && parts[3] === "editable.pdf") {
      // the paper as a PDF whose text stays text in CorelDRAW (export/pdf-editable.ts)
      const got = store.latestIssue(date);
      if (!got) return send(res, 404, { error: `no issue built for ${date}` });
      return sendEditable(res, got.issue, undefined, sister?.id);
    }
    if (req.method === "POST" && parts[3] === "editable-folder") {
      // a Hindi or Urdu paper for CorelDRAW with its text editable: a folder in Downloads (export/corel-folder.ts)
      const got = store.latestIssue(date);
      if (!got) return send(res, 404, { error: `no issue built for ${date}` });
      const { saveEditable } = await import("../export/corel-folder.ts");
      const frame = sister ? await frameFor(sister.id, date) : null;
      return send(res, 200, { folder: await saveEditable(got.issue, sister?.id ?? "paper", frame ? [{ name: "title and footer.pdf", pdf: frame }] : []) });
    }
    if (req.method === "GET" && parts[3] === "editable8.pdf") {
      // the 8-page paper as a PDF whose text stays text in CorelDRAW
      const eight = store.setting<{ json?: string } | null>(`eightPages|${date}`, null);
      if (!eight?.json || !existsSync(outFile(eight.json))) return send(res, 404, { error: `no 8-page paper for CorelDRAW for ${date}: make the paper again` });
      return sendEditable(res, JSON.parse(await readFile(outFile(eight.json), "utf8")));
    }
    if (req.method === "GET" && parts[3] === "pdf8") {
      // the 8-page paper (pipeline.ts "sections")
      const eight = store.setting<{ pdf: string } | null>(`eightPages|${date}`, null);
      if (!eight || !existsSync(outFile(eight.pdf))) return send(res, 404, { error: `no 8-page paper made for ${date}` });
      return send(res, 200, new Uint8Array(await readFile(outFile(eight.pdf))), "application/pdf");
    }
    if (req.method === "GET" && parts[3] === "pdf") {
      const got = store.latestIssue(date);
      const file = (got?.report as { pdf?: string } | undefined)?.pdf;
      if (!file) return send(res, 404, { error: `no issue built for ${date}` });
      const pdf = new Uint8Array(await readFile(outFile(file)));
      // (a sister paper's with its title and footer for the day, if it has them)
      return send(res, 200, sister ? await withFrame(sister.id, date, pdf) : pdf, "application/pdf");
    }
    if (sister && parts[3] === "frame") {
      // a sister paper's title and footer for the day: a PDF of its page size, laid over its pages (export/frame.ts)
      if (req.method === "GET") return send(res, 200, { frame: await frameInfo(sister.id, date) });
      if (req.method === "DELETE") { await removeFrame(sister.id, date); return send(res, 200, { frame: null }); }
      if (req.method === "POST") {
        const body = (await readJson(req)) as { base64?: string };
        if (!body.base64) return send(res, 400, { error: "no file" });
        // (the sister papers are printed at the paper's own size)
        const wrong = await saveFrame(sister.id, date, body.base64, (await import("../profile.ts")).profile.page);
        if (wrong) return send(res, 400, { error: wrong });
        return send(res, 200, { frame: await frameInfo(sister.id, date) });
      }
    }
    if (req.method === "POST" && parts[3] === "build") return startJob(res, date, "build");
    if (req.method === "POST" && parts[3] === "approve") {
      const got = store.latestIssue(date);
      if (!got) return send(res, 404, { error: `no issue built for ${date}` });
      store.approve(date, got.version);
      return send(res, 200, { date, version: got.version, status: "approved" });
    }
    if (parts[3] === "articles") {
      // the editor's own articles in the day's paper, word for word (editorial/articles.ts)
      const { paperArticles, savePaperArticles, takeArticles } = await import("../editorial/articles.ts");
      // (a sister paper's are its own, printed in it alone)
      if (req.method === "GET") return send(res, 200, paperArticles(date, sister?.id));
      if (req.method === "POST") {
        const body = (await readJson(req)) as { articles?: import("../editorial/articles.ts").GivenArticle[] };
        const articles = await takeArticles(date, body.articles ?? [], sister ? `paper-${sister.id}` : "paper");
        if (typeof articles === "string") return send(res, 400, { error: articles });
        await savePaperArticles(date, articles, sister?.id);
        // the paper laid out again with them, as after an edit
        if (!store.latestIssue(date)) return send(res, 200, { saved: true });
        if (currentJob() || copiesNow?.()?.date === date) {
          later(date);
          return send(res, 202, { saved: true, rebuilding: "after the run that's going" });
        }
        return startJob(res, date, "build");
      }
    }
    if (req.method === "POST" && parts[3] === "edits") {
      const body = (await readJson(req)) as { storyId: string; change: Record<string, unknown> };
      if (!body.storyId || !body.change) return send(res, 400, { error: "an edit needs storyId and change" });
      store.addEdit({ issueDate: date, storyId: body.storyId, change: body.change, at: new Date().toISOString() });
      // laid out again in the background; while a run goes (this day's or
      // another's), the day is laid out again as soon as it's done
      if (currentJob() || copiesNow?.()?.date === date) {
        later(date);
        return send(res, 202, { saved: true, rebuilding: "after the run that's going" });
      }
      return startJob(res, date, "build");
    }
    if (req.method === "POST" && parts[3] === "publish") {
      const got = store.latestIssue(date);
      if (!got) return send(res, 404, { error: `no issue built for ${date}` });
      if (sister) return send(res, 400, { error: "Only Capital Kranti goes on the website." });
      // the app (no Git) publishes through the one-time GitHub sign-in
      if (!existsSync(path.join(ROOT, ".git")) && !process.env.GITHUB_TOKEN) {
        return send(res, 400, { error: "The website isn't connected yet. Open Settings and press Connect (once), then publish again." });
      }
      const { publishIssue } = await import("../publish.ts");
      const lines: string[] = [];
      const body = (await readJson(req)) as { force?: boolean };
      const published = await publishIssue(store, date, { log: (l) => { lines.push(l); log(l); }, push: true, force: !!body.force });
      store.approve(date, got.version);
      return send(res, 200, { date, version: got.version, status: "approved", published, log: lines });
    }
  }
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "pages" && parts[2] && /^\d+\.png$/.test(parts[3] ?? "")) {
    // a page as an image (for papers whose fonts may not be served publicly)
    const { pageImageDir } = await import("../build.ts");
    try {
      const png = await readFile(path.join(sister ? path.join(sisterOut(sister.id, parts[2]), "pages") : pageImageDir(parts[2]), parts[3]));
      return send(res, 200, new Uint8Array(png), "image/png");
    } catch {
      return send(res, 404, { error: `no image of page ${parts[3]} for ${parts[2]}` });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/stories") {
    const date = url.searchParams.get("date") ?? store.latestDate() ?? "";
    // as the editor left them: edits applied, the dropped ones marked, where each one went
    const { applyTextEdits, droppedBy } = await import("../layout/stories.ts");
    const edits = store.edits(date);
    const dropped = droppedBy(edits);
    const report = store.latestIssue(date)?.report as { placed?: { page: number; story: string; cols: number }[];
                                                         printed?: { id: string; headline: string; deck: string; body: string }[] } | undefined;
    const where = new Map((report?.placed ?? []).map((p) => [p.story, p]));
    let stories = applyTextEdits(store.stories(date), edits);
    if (sister) {
      // a sister paper's stories in its own words, as it printed them (reworded or translated), its own edits over them
      const printed = new Map((report?.printed ?? []).map((p) => [p.id, p]));
      stories = applyTextEdits(stories.map((s) => {
        const p = printed.get(s.id);
        return p ? { ...s, headline: p.headline, deck: p.deck, bodies: { long: p.body, medium: p.body, short: p.body } } : s;
      }), sister.ownEdits(date).filter(textEdit));
    }
    return send(res, 200, stories.map((s) => ({
      ...s, dropped: dropped.has(s.id), edited: edits.some((e) => e.storyId === s.id),
      page: where.get(s.id)?.page ?? null, cols: where.get(s.id)?.cols ?? null,
    })));
  }
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "export" && parts[2]?.endsWith(".svg")) {
    const date = parts[2].replace(/\.svg$/, "");
    const got = store.latestIssue(date);
    if (!got) return send(res, 404, { error: `no issue built for ${date}` });
    const { pageSvg } = await import("../export/svg.ts");
    return send(res, 200, await pageSvg(got.issue, Number(url.searchParams.get("page") ?? 1)), "image/svg+xml; charset=utf-8");
  }
  if (parts[0] === "api" && parts[1] === "jobs") {
    if (req.method === "GET" && parts[2] === "current") return send(res, 200, currentJob());
    if (req.method === "POST" && parts[2] === "current" && parts[3] === "stop") {
      const { stopJob } = await import("../pipeline.ts");
      return stopJob() ? send(res, 202, { stopping: true }) : send(res, 404, { error: "nothing is being made" });
    }
    if (req.method === "GET" && !parts[2]) return send(res, 200, store.jobs(url.searchParams.get("date") ?? undefined));
    if (req.method === "POST" && !parts[2]) {
      const body = (await readJson(req)) as { date?: string; from?: StepName };
      if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return send(res, 400, { error: "a run needs a date (YYYY-MM-DD)" });
      if (body.from && !STEPS.includes(body.from)) return send(res, 400, { error: `no step "${body.from}"` });
      return startJob(res, body.date, body.from);
    }
  }
  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${JSON.stringify({ job: currentJob() })}\n\n`);
    const off = onJob((job, line) => res.write(`data: ${JSON.stringify({ job, line })}\n\n`));
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => { off(); clearInterval(ping); });
    return true;
  }
}
