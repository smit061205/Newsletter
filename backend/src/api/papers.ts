// The papers this newsroom knows (publications/<id>/), a new one drafted from
// its PDFs and saved, and another paper's test issue.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { ENV_FILE, outFile, PAPERS_HOME, publicationDir, ROOT } from "../config.ts";
import { PUBLICATION as PUBLICATION_ID } from "../profile.ts";
import { indiaNow, readJson, send } from "./http.ts";


/** The papers: publications/<id>/ each (those that ship with the code, and
 * those added here, in PAPERS_HOME); every one but the one this engine makes
 * keeps its own data folder (papers/<id>/), and its test issue is built there
 * in a process of its own. The desktop app switches which paper the newsroom
 * works on (it starts this engine again for that paper). */
let testing: { id: string; done: boolean } | null = null;
export async function papersApi(req: IncomingMessage, res: ServerResponse, parts: string[], url: URL) {
  const { readdir } = await import("node:fs/promises");
  const homes = [path.join(ROOT, "publications"), path.join(PAPERS_HOME, "publications")];
  // Capital Kranti keeps its data in the main data folder (a checkout: backend/data); every other paper in papers/<id>/
  const dataOf = (id: string) => id !== "capital-kranti" ? path.join(PAPERS_HOME, "papers", id)
    : PAPERS_HOME === ROOT ? path.join(ROOT, "backend", "data") : PAPERS_HOME;
  const known = async () => [...new Set((await Promise.all(homes.map((h) => readdir(h).catch(() => [] as string[])))).flat())]
    .filter((d) => /^[a-z0-9-]+$/.test(d) && existsSync(path.join(publicationDir(d), "profile.json")));
  /** Another paper's latest test issue (from its own data folder). */
  const issueOf = async (id: string) => {
    const file = path.join(dataOf(id), "capital-kranti.sqlite");
    if (id === PUBLICATION_ID || !existsSync(file)) return null;
    const { Store } = await import("../store.ts");
    const st = new Store(file);
    try {
      const day = st.latestDate();
      const got = day ? st.latestIssue(day) : null;
      if (!got) return null;
      const rep = got.report as { ready?: boolean; pdf?: string; gates?: unknown[] };
      return { date: day, version: got.version, ready: rep.ready, pdf: rep.pdf && outFile(rep.pdf, path.join(dataOf(id), "out")), gates: rep.gates };
    } finally { st.db.close(); }
  };
  if (req.method === "POST" && parts[2] === "draft") {
    const body = (await readJson(req)) as { pdfs?: string[] };
    if (!body.pdfs?.length) return send(res, 400, { error: "upload one or more of the paper's PDF issues" });
    const { extractDraft } = await import("../onboard/extract.ts");
    return send(res, 200, await extractDraft(body.pdfs.map((b) => new Uint8Array(Buffer.from(b, "base64")))));
  }
  if (req.method === "GET" && !parts[2]) {
    const out = [];
    for (const id of (await known()).sort()) {
      const prof = JSON.parse(readFileSync(path.join(publicationDir(id), "profile.json"), "utf8")) as { name: string; language: { lang: string }; issue: { pages: number } };
      out.push({ id, name: prof.name, lang: prof.language.lang, pages: prof.issue.pages, own: id === PUBLICATION_ID,
                 added: publicationDir(id).startsWith(path.join(PAPERS_HOME, "publications")) && PAPERS_HOME !== ROOT,
                 test: ["dev-test", "sample-english", "sample-urdu"].includes(id), testing: testing?.id === id && !testing.done,
                 // the Hindi and Urdu sister papers' layouts (editorial/copies.ts): made from Capital Kranti, not on their own
                 hidden: id.startsWith("edition-"),
                 issue: await issueOf(id) });
    }
    return send(res, 200, out);
  }
  if (req.method === "POST" && !parts[2]) {
    const { savePaper } = await import("../onboard/save.ts");
    const saved = await savePaper((await readJson(req)) as import("../onboard/save.ts").NewPaper);
    // the profile must load as the engine will load it
    const { ProfileSchema } = await import("@ck/shared/profile");
    const check = ProfileSchema.safeParse(JSON.parse(readFileSync(path.join(saved.dir, "profile.json"), "utf8")));
    if (!check.success) return send(res, 400, { error: `the profile doesn't validate: ${check.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` });
    return send(res, 200, saved);
  }
  const id = parts[2];
  if (!id || !/^[a-z0-9-]+$/.test(id) || !(await known()).includes(id)) return send(res, 404, { error: `no paper "${id}"` });
  if (req.method === "POST" && parts[3] === "test") {
    if (id === PUBLICATION_ID) return send(res, 400, { error: "that's the paper this newsroom makes: make it from Today" });
    if (testing && !testing.done) return send(res, 409, { error: `a test issue of ${testing.id} is being made` });
    const body = (await readJson(req)) as { date?: string };
    const date = body.date ?? indiaNow().day;
    const { spawn } = await import("node:child_process");
    const { openSync } = await import("node:fs");
    await mkdir(dataOf(id), { recursive: true });
    const logFd = openSync(path.join(dataOf(id), "test.log"), "w");
    // the same Node flags as this engine (inside the app: the hook that finds the shared code)
    const child = spawn(process.execPath, [...process.execArgv, path.join(ROOT, "backend", "src", "cli.ts"), "all", "--date", date],
      { cwd: ROOT, env: { ...process.env, CK_PUBLICATION: id, DATA_DIR: dataOf(id), CK_ENV_FILE: ENV_FILE, CK_PAPERS_HOME: PAPERS_HOME },
        stdio: ["ignore", logFd, logFd], detached: false, windowsHide: true });
    const run = { id, done: false };
    testing = run;
    child.on("exit", () => { run.done = true; });
    child.on("error", () => { run.done = true; });
    return send(res, 202, { id, date, started: true });
  }
  if (req.method === "GET" && parts[3] === "pdf") {
    const got = await issueOf(id);
    if (!got?.pdf || !existsSync(got.pdf)) return send(res, 404, { error: `no test issue for ${id} yet` });
    return send(res, 200, new Uint8Array(await readFile(got.pdf)), "application/pdf");
  }
  if (req.method === "GET" && !parts[3]) {
    const logFile = path.join(dataOf(id), "test.log");
    const log = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter((l) => l && !/^  p\d  |fit to/.test(l)).slice(-40) : [];
    return send(res, 200, { id, issue: await issueOf(id), log, running: testing?.id === id && !testing.done });
  }
  return send(res, 404, { error: "not found" });
}
