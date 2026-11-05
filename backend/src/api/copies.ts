// The day's other papers: its copies (editorial/copies.ts), its sister papers,
// and the designs of the papers the copies go to (export/designs.ts).
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { currentJob } from "../pipeline.ts";
import { profile } from "../profile.ts";
import { readJson, send, type Ctx } from "./http.ts";
import { settingsOf } from "./settings.ts";
import { withFrame } from "../export/frame.ts";

export async function copiesRoutes(c: Ctx) {
  const { store, log, req, res, parts } = c;
  if (parts[0] === "api" && parts[1] === "issues" && parts[2]) {
    const date = parts[2];
    if ((parts[3] === "copies" || parts[3] === "editions") && parts[4] === "stop" && req.method === "POST") {
      const { stopCopies } = await import("../editorial/copies.ts");
      return stopCopies() ? send(res, 202, { stopping: true }) : send(res, 404, { error: "nothing is being made" });
    }
    if (parts[3] === "copies") {
      const { copiesOf, copyFile, currentCopies, makeCopies } = await import("../editorial/copies.ts");
      if (req.method === "GET" && parts[4]?.endsWith(".editable.pdf")) {
        const json = copyFile(date, Number(parts[4].replace(/\.editable\.pdf$/, ""))).replace(/\.pdf$/, ".json");
        if (!existsSync(json)) return send(res, 404, { error: "make the copies again for their CorelDRAW PDF" });
        return sendEditable(res, JSON.parse(await readFile(json, "utf8")), Number(parts[4].replace(/\.editable\.pdf$/, "")));
      }
      if (req.method === "GET" && parts[4]) {
        const n = Number(parts[4].replace(/\.pdf$/, ""));
        const file = copyFile(date, n);
        if (!Number.isInteger(n) || n < 1 || !existsSync(file)) return send(res, 404, { error: `no copy ${parts[4]} for ${date}` });
        return send(res, 200, await onDesign(new Uint8Array(await readFile(file)), n), "application/pdf");
      }
      if (req.method === "GET") return send(res, 200, copiesOf(date));
      // which of the day's stories a customer's articles take the place of in the copies (shown before they're made)
      if (req.method === "POST" && parts[4] === "swaps") {
        const { sameAsArticles } = await import("../editorial/copies.ts");
        const body = (await readJson(req)) as { articles?: { titles?: string[]; bodies?: string[] }[] };
        const arts = (body.articles ?? []).map((a) => ({ titles: (a.titles ?? []).filter((x) => x.trim()), bodies: (a.bodies ?? []).filter((x) => x.trim()) }))
          .filter((a) => a.titles.length || a.bodies.length);
        if (!arts.length) return send(res, 200, { headlines: [] });
        const got = await sameAsArticles(store, date, arts, () => {});
        return send(res, 200, { headlines: got.headlines });
      }
      if (req.method === "POST") {
        type Pic = import("../editorial/articles.ts").GivenPhoto;
        type Given = import("../editorial/articles.ts").GivenArticle;
        const body = (await readJson(req)) as { count?: number; reword?: string; shuffle?: string; lang?: string; articles?: Given[]; pages?: number;
                                                extra?: { body?: string; deck?: string; titles?: string[]; photos?: Pic[] } };
        if (body.lang !== undefined && !["gu", "hi", "ur"].includes(body.lang)) return send(res, 400, { error: "the language is gu, hi or ur" });
        const count = Math.round(Number(body.count));
        if (!(count >= 1 && count <= 50)) return send(res, 400, { error: "make between 1 and 50 copies" });
        if (!["headline", "headlineDeck", "all"].includes(body.reword ?? "")) return send(res, 400, { error: "what to reword: headline, headlineDeck or all" });
        if (!["keepLead", "anywhere", "samePage"].includes(body.shuffle ?? "")) return send(res, 400, { error: "how far stories move: keepLead, anywhere or samePage" });
        if (currentCopies()) return send(res, 409, { error: "copies or the other papers are being made: wait for them to finish" });
        if (currentJob()?.date === date) return send(res, 409, { error: "the day's paper is being made: make copies when it's done" });
        if (!store.latestIssue(date)) return send(res, 404, { error: `no paper made for ${date} yet` });
        // copies of the 8-page paper: in the paper's language, once the evening has made it
        if (body.pages !== undefined && body.pages !== 4 && body.pages !== 8) return send(res, 400, { error: "copies have 4 or 8 pages" });
        if (body.pages === 8) {
          if ((body.lang ?? profile.language.lang) !== profile.language.lang) return send(res, 400, { error: "the 8-page copies are in Gujarati only" });
          const eight = store.setting<{ version: number } | null>(`eightPages|${date}`, null);
          if (!eight || eight.version !== store.latestIssue(date)!.version) return send(res, 409, { error: "make the day's paper again first: its 8 pages weren't made with it" });
        }
        // articles in every copy, word for word: their titles, sub-headings, texts and photos, the photos saved with the day's
        const given: Given[] = body.articles ?? (body.extra ? [{ titles: body.extra.titles, decks: body.extra.deck ? [body.extra.deck] : [],
                                                                  bodies: [body.extra.body ?? ""], photos: body.extra.photos }] : []);
        if (given.length && (body.lang ?? "gu") !== "gu") return send(res, 400, { error: "the articles go in Gujarati copies only" });
        const { takeArticles } = await import("../editorial/articles.ts");
        const articles = await takeArticles(date, given, "fixed");
        if (typeof articles === "string") return send(res, 400, { error: articles });
        makeCopies(store, date, { count, reword: body.reword as "headline", shuffle: body.shuffle as "keepLead", lang: body.lang as "gu" | undefined, articles, pages: body.pages, log })
          .catch((e) => log(`copies stopped: ${e instanceof Error ? e.message : e}`));
        return send(res, 202, copiesOf(date));
      }
    }
    if (parts[3] === "editions") {
      const { batchOf, currentCopies, editionFile, makeEditions } = await import("../editorial/copies.ts");
      const editions = settingsOf(store).editions;
      if (req.method === "GET" && parts[4]?.endsWith(".editable.pdf")) {
        const id = parts[4].replace(/\.editable\.pdf$/, "");
        const json = editions.some((e) => e.id === id) ? editionFile(date, id).replace(/\.pdf$/, ".json") : "";
        if (!json || !existsSync(json)) return send(res, 404, { error: "make the papers again for their CorelDRAW PDF" });
        return sendEditable(res, JSON.parse(await readFile(json, "utf8")), undefined, id);
      }
      if (req.method === "GET" && parts[4]) {
        const id = parts[4].replace(/\.pdf$/, "");
        const file = editions.some((e) => e.id === id) ? editionFile(date, id) : "";
        if (!file || !existsSync(file)) return send(res, 404, { error: `no paper ${id} for ${date}` });
        // (with its title and footer for the day, if it has them: export/frame.ts)
        return send(res, 200, await withFrame(id, date, new Uint8Array(await readFile(file))), "application/pdf");
      }
      if (req.method === "GET") return send(res, 200, { editions, run: batchOf("editions", date) });
      if (req.method === "POST") {
        const body = (await readJson(req)) as { only?: string };
        if (body.only && !editions.some((e) => e.id === body.only)) return send(res, 404, { error: `no paper ${body.only}` });
        if (currentCopies()) return send(res, 409, { error: "copies or the other papers are being made: wait for them to finish" });
        if (currentJob()?.date === date) return send(res, 409, { error: "the day's paper is being made: make the other papers when it's done" });
        if (!store.latestIssue(date)) return send(res, 404, { error: `no paper made for ${date} yet` });
        makeEditions(store, date, editions, { log, only: body.only }).catch((e) => log(`other papers stopped: ${e instanceof Error ? e.message : e}`));
        return send(res, 202, { editions, run: batchOf("editions", date) });
      }
    }
  }
  if (parts[0] === "api" && parts[1] === "designs") {
    const d = await import("../export/designs.ts");
    const dayOk = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
    try {
      if (req.method === "GET" && !parts[2]) return send(res, 200, await d.designsOf());
      if (req.method === "DELETE" && parts[2]) return send(res, 200, await d.dropDesign(parts[2] === "all" ? null : parts[2]));
      if (req.method === "POST" && !parts[2]) {
        const body = (await readJson(req)) as { name?: string; base64?: string };
        if (!body.base64) return send(res, 400, { error: "no file" });
        return send(res, 200, await d.addDesign(body.name || "design.pdf", new Uint8Array(Buffer.from(body.base64, "base64"))));
      }
      if (req.method === "POST" && parts[2] === "assign") {
        // one copy, or (`upTo`) copies 1 to upTo
        const body = (await readJson(req)) as { copy?: number; upTo?: number; id?: string | null };
        const n = Math.round(Number(body.copy ?? 1)), last = Math.round(Number(body.upTo ?? n));
        if (!(n >= 1 && last >= n && last <= 200)) return send(res, 400, { error: "which copy: 1 to 200" });
        return send(res, 200, await d.assign(Array.from({ length: last - n + 1 }, (_, i) => n + i), body.id || null));
      }
      // every copy of the day the app has, on its design, into the Downloads folder
      if (req.method === "POST" && parts[2] === "save") {
        const body = (await readJson(req)) as { date?: string; names?: Record<string, string> };
        if (!dayOk(body.date)) return send(res, 400, { error: "which day" });
        const { copiesOf, copyFile } = await import("../editorial/copies.ts");
        const { editablePdf } = await import("../export/pdf-editable.ts");
        const saved: number[] = [];
        const without: number[] = [];
        for (const f of copiesOf(body.date)?.files ?? []) {
          const design = await d.designFor(f.n);
          if (!design) { without.push(f.n); continue; }
          const json = copyFile(body.date, f.n).replace(/\.pdf$/, ".json");
          const corel = existsSync(json) ? await editablePdf(JSON.parse(await readFile(json, "utf8"))) : null;
          const pdf = corel ? new Uint8Array(corel) : new Uint8Array(await readFile(copyFile(body.date, f.n)));
          const name = (body.names?.[String(f.n)] ?? `copy ${f.n}.pdf`).replace(/[\\/:*?"<>|]/g, "-");
          await d.stampFile(body.date, f.n, name, pdf);
          saved.push(f.n);
        }
        return send(res, 200, { folder: d.outFolder(body.date), saved, without });
      }
      // a copy made before, from elsewhere, on copy n's design
      if (req.method === "POST" && parts[2] === "stamp") {
        const body = (await readJson(req)) as { date?: string; copy?: number; name?: string; base64?: string };
        if (!dayOk(body.date) || !body.base64) return send(res, 400, { error: "which day, and the file" });
        const n = Math.round(Number(body.copy));
        const name = (body.name || `copy ${n}.pdf`).replace(/[\\/:*?"<>|]/g, "-");
        await d.stampFile(body.date, n, name, new Uint8Array(Buffer.from(body.base64, "base64")));
        return send(res, 200, { folder: d.outFolder(body.date) });
      }
      if (req.method === "POST" && parts[2] === "reveal") {
        const body = (await readJson(req)) as { date?: string };
        if (!dayOk(body.date) || !existsSync(d.outFolder(body.date))) return send(res, 404, { error: "nothing saved for that day yet" });
        const { spawn } = await import("node:child_process");
        const dir = d.outFolder(body.date);
        spawn(process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open", [dir], { detached: true, stdio: "ignore" }).unref();
        return send(res, 200, { folder: dir });
      }
    } catch (e) { return send(res, 400, { error: e instanceof Error ? e.message : String(e) }); }
  }
}

/** An issue as the CorelDRAW PDF, or why there's none (a Hindi or Urdu paper's text needs shaping). */
/** `copy`: a copy's number, printed onto the designs of the paper it goes to (export/designs.ts). */
/** `sister`: a sister paper's, with its title and footer for the day (export/frame.ts). */
export async function sendEditable(res: ServerResponse, issue: import("@ck/shared/contract").IssueRender, copy?: number, sister?: string) {
  const { editablePdf } = await import("../export/pdf-editable.ts");
  const pdf = await editablePdf(issue);
  if (!pdf) return send(res, 400, { error: "this paper has no CorelDRAW PDF: use its print PDF" });
  return send(res, 200, copy ? await onDesign(new Uint8Array(pdf), copy)
    : sister ? await withFrame(sister, issue.issueDate, new Uint8Array(pdf)) : pdf, "application/pdf");
}
/** Copy `n`'s PDF on the title, headers and footer of the paper it goes to, if it has one. */
async function onDesign(pdf: Uint8Array, n: number): Promise<Uint8Array> {
  const { designFor, withDesign } = await import("../export/designs.ts");
  const design = Number.isInteger(n) && n > 0 ? await designFor(n) : null;
  return design ? withDesign(pdf, design) : pdf;
}
