// The day's whole run, one step after another -- what the 8 PM job and the
// newsroom's "Run now" both do:
//
//   fetch    PIB's Gujarati releases for the day (ingest/pib.ts)
//   rewrite  each into a story in the paper's style (editorial/rewrite.ts)
//   topup    Hindi releases translated while the copy is short (editorial/translate.ts)
//   fill     still short: a couple of feature articles (editorial/features.ts)
//   build    lay out, check and print the issue (build.ts)
//
// Each run is a job (store.ts): every step's log as it happens, so the
// newsroom shows it live, and a failed step can be run again from there --
// what the earlier steps stored stays stored.
import { spawn } from "node:child_process";
import { buildIssue } from "./build.ts";
import type { Job, JobStep, Progress, StepName, Store } from "./store.ts";

export const STEPS: StepName[] = ["fetch", "rewrite", "topup", "fill", "build"];

type Listener = (job: Job, line?: string) => void;
const listeners = new Set<Listener>();
/** Every change to a running job (the newsroom's live log). Returns an unsubscribe. */
export function onJob(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Keep the computer from sleeping while a run goes (the 8 PM run wakes it;
 * this stops it dozing off again halfway). Returns a function that lets it. */
function keepAwake(): () => void {
  try {
    const child = process.platform === "darwin" ? spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" })
      : process.platform === "win32" ? spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command",
          "$s='[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);';" +
          "$t=Add-Type -MemberDefinition $s -Name K -Namespace W -PassThru; $t::SetThreadExecutionState(0x80000001) | Out-Null;" +
          `while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep 30 }`], { stdio: "ignore", windowsHide: true })
      : null;
    child?.on("error", () => {});
    return () => child?.kill();
  } catch {
    return () => {};
  }
}

let running: Job | null = null;
let stopping = false;
/** Stop the run that's going: it ends at its next step of progress (an AI
 * call already sent finishes first); what it stored so far stays stored. */
export function stopJob(): boolean {
  if (!running) return false;
  stopping = true;
  return true;
}
const STOPPED = "stopped by the editor";
const checkStop = () => { if (stopping) throw new Error(STOPPED); };
/** Wait, unless the run is stopped meanwhile. */
async function waitOrStop(ms: number) {
  for (let t = 0; t < ms; t += 1000) { checkStop(); await new Promise((ok) => setTimeout(ok, Math.min(1000, ms - t))); }
}

/** Runs a previous engine left "running" (it was stopped or the computer
 * restarted): marked stopped, so the newsroom offers to run them again. */
export function settleInterrupted(store: Store) {
  for (const job of store.jobs(undefined, 50)) {
    if (job.status !== "running") continue;
    job.status = "failed";
    job.endedAt = new Date().toISOString();
    for (const s of job.steps) {
      if (s.status === "running") { s.status = "failed"; s.error = "stopped: the engine was restarted"; }
    }
    store.putJob(job);
  }
}
/** The job running now, if any: one at a time. */
export const currentJob = () => running;
/** The hourly collection under way, if any (server.ts): a run waits for it, so
 * the two never write the same stories at once. */
export const collecting: { current: Promise<unknown> | null } = { current: null };

// PIB not answering (its server down, the internet gone): the fetch waits and
// tries again, every 10 minutes for up to 2 hours, saying so
const RETRY_EVERY_MS = 10 * 60_000;
const RETRIES = 12;

// layout checks a new arrangement of the paper can mend (gate names, report.gates)
const REPAIR_BY_LAYOUT = /^(1 plotter|2 no empty space|3 no tombstoned|3 headline sizes|3 no headline over|S2 |S4 |S9 |W )/;

/** The other ways the paper is laid out when its checks fail, in turn: other
 * arrangements; then, against empty space, the front page's lead in its usual
 * width, the short items let in to fill gaps, and both (28 Oct: two more
 * arrangements left page 1 a fifth empty, and the last, the worst, was kept). */
const MENDS: { seedShift: number; mend?: { narrowLead?: boolean; shortItems?: boolean }; why: string }[] = [
  { seedShift: 1, why: "another arrangement" },
  { seedShift: 2, why: "another arrangement" },
  { seedShift: 0, mend: { narrowLead: true }, why: "the front page's lead in its usual width" },
  { seedShift: 0, mend: { shortItems: true }, why: "short items let in to fill the gaps" },
  { seedShift: 3, mend: { narrowLead: true, shortItems: true }, why: "the lead in its usual width and the short items let in" },
];
/** Mending stops after this long (minutes): the paper is wanted the same evening. */
const MEND_MINUTES = 10;

/** How far a build is from clean: each check failing (not the page review,
 * which comes after, nor gate 7, which only compares builds), and every point
 * of a column left empty. 0 is clean. */
function badness(r: { gates: { gate: string; pass: boolean }[]; whiteSpace: { height: number }[] }): number {
  return r.gates.filter((g) => !g.pass && !/^[57] /.test(g.gate)).length * 1000 + r.whiteSpace.reduce((a, w) => a + w.height, 0);
}

/** Runs `job`, noting how long it took as one of the step's parts (the time meter). */
type Timed = <T>(name: string, job: () => Promise<T>) => Promise<T>;

async function step(store: Store, date: string, name: StepName, say: (s: string) => void, progress: (p: Progress) => void,
                    timed: Timed, part: (name: string, seconds: number) => void, by: Job["by"]) {
  switch (name) {
    case "fetch": {
      // the paper's own language from PIB (Gujarati: PIB Ahmedabad)
      const { ingestPib, FEEDS } = await import("./ingest/pib.ts");
      const { profile } = await import("./profile.ts");
      const feed = (profile.language.lang in FEEDS ? profile.language.lang : "en") as keyof typeof FEEDS;
      // an earlier day: its list as collected that day, or found on PIB by
      // release number (ingest/pib.ts); if neither can be had, waiting won't
      // bring it: the day is made from the releases already saved
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(Date.now());
      const past = date < today;
      // then the CM's office and All India Radio's Gujarati news (a Gujarati
      // paper): extra copy, so a site not answering never stops the paper
      // (read side by side with PIB: each site at its own polite pace)
      const officialRun = (async () => {
        if (profile.language.lang !== "gu") return;
        const { ingestOfficial } = await import("./ingest/official.ts");
        try {
          const o = await timed("CM's office and All India Radio", () => ingestOfficial(store, date, { log: say }));
          say(`the CM's office and All India Radio: ${o.listed} listed, ${o.fetched} new`);
        } catch (e) {
          if (stopping) throw e;
          say(`the CM's office and All India Radio couldn't be read (${e instanceof Error ? e.message : e}): the paper is made from PIB's news`);
        }
      })();
      // (and PIB's Hindi and English releases, read now for the translation step)
      const foreignRun = profile.language.lang === "gu"
        ? timed("PIB Hindi and English", async () => { const { readForeign } = await import("./editorial/translate.ts"); return readForeign(store, date, say); })
            .catch((e: unknown) => { if (stopping) throw e; say(`PIB's Hindi and English releases couldn't be read ahead (${e instanceof Error ? e.message : e})`); return 0; })
        : Promise.resolve(0);
      // both in: an item that is the same news as a PIB release that came in alongside it goes
      const official = async () => {
        await Promise.all([officialRun, foreignRun]);
        // what the editor sent the paper's Telegram bot since the last paper (today's paper only:
        // an earlier day's, made again, doesn't take what's new)
        if (!past) {
          const { ingestTelegram } = await import("./ingest/telegram.ts");
          await timed("Telegram", () => ingestTelegram(store, date, { log: say }))
            .catch((e: unknown) => { if (stopping) throw e; say(`the Telegram news couldn't be taken (${e instanceof Error ? e.message : e})`); });
        }
        if (profile.language.lang !== "gu") return;
        const { dropTwinsOfPib } = await import("./ingest/official.ts");
        dropTwinsOfPib(store, date, say);
      };
      let r: Awaited<ReturnType<typeof ingestPib>> | null = null;
      for (let attempt = 0; !r; attempt++) {
        try {
          r = await timed("PIB", () => ingestPib(store, date, feed, { log: say, progress }));
        } catch (e) {
          const saved = store.releases(date).length;
          if (past && saved) {
            say(`PIB won't show ${date}'s list now (${e instanceof Error ? e.message : e}): the paper is made from the ${saved} release(s) saved that day`);
            await official();
            return;
          }
          if (past) {
            // (the other sources may have the day all the same)
            await official();
            if (store.releases(date).length) { say(`PIB won't show ${date}'s list: the paper is made from the other sources' news`); return; }
            throw new Error(`PIB won't show ${date}'s list, and no news was saved that day`);
          }
          if (attempt >= RETRIES) throw e;
          const at = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(Date.now() + RETRY_EVERY_MS);
          say(`PIB isn't answering (${e instanceof Error ? e.message : e}): trying again at ${at}`);
          progress({ done: 0, total: 0, label: "waiting", item: at });
          await waitOrStop(RETRY_EVERY_MS);
        }
      }
      say(`${r.listed} listed, ${r.fetched} new, ${r.skipped} already stored`);
      await official();
      if (!store.releases(date).length) throw new Error(`PIB has no releases in the paper's language for ${date} yet`);
      return;
    }
    case "rewrite": {
      const { rewriteDay } = await import("./editorial/rewrite.ts");
      return rewriteDay(store, date, { log: say, progress });
    }
    case "topup": {
      // (translating Hindi tops up a Gujarati paper; other papers take their own language whole)
      const { profile } = await import("./profile.ts");
      if (profile.language.lang !== "gu") return say(`a ${profile.language.lang} paper: no translation step`);
      const { topUp } = await import("./editorial/translate.ts");
      // extra copy, not the paper itself: PIB not answering (24 Oct, a timeout)
      // mustn't stop the evening's paper -- it's made from what the day has
      try {
        const { withPatience } = await import("./ingest/pib.ts");
        // (an earlier day's Hindi list was saved with its Gujarati one, collected
        // or found by number: one short try, not two)
        const past = date < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(Date.now());
        await withPatience(past ? { tries: 1, seconds: 15 } : { tries: 2, seconds: 20 }, () => topUp(store, date, { log: say, progress }));
      } catch (e) {
        if (stopping) throw e;
        say(`the Hindi top-up couldn't finish (${e instanceof Error ? e.message : e}): the paper is made from what the day has`);
      }
      return;
    }
    case "fill": {
      // as many features as the pages still need (a weekend's PIB can fill
      // under half the paper, 24 Oct), a few at a time, measured as they come
      const { fillContext } = await import("./build.ts");
      const { writeFeatures } = await import("./editorial/features.ts");
      const { profile } = await import("./profile.ts");
      const WANT = 1.1;
      for (let round = 0; round < 3; round++) {
        const ctx = await fillContext(store, date);
        const share = ctx.share();
        const features = store.stories(date).filter((s) => s.id.startsWith("f-"));
        const each = features.length ? (await Promise.all(features.map((f) => ctx.areaOf(f)))).reduce((a, b) => a + b, 0) / features.length : 0;
        await ctx.close();
        if (share >= WANT) return say(`the copy fills ${(share * 100).toFixed(0)}% of the pages${round ? "" : ": no features needed"}`);
        // how many more, from a feature's size (a first guess: an eighth of a page)
        const need = Math.ceil(((WANT - share) * ctx.room) / (each || ctx.room / (8 * profile.issue.pages)));
        say(`the copy fills ${(share * 100).toFixed(0)}% of the pages: writing ${need} feature article(s)`);
        progress({ done: round, total: round + 1, label: "features", item: `${(share * 100).toFixed(0)}%` });
        // all at once, three to a request, each request its own subjects (so no two write on the same thing)
        const SUBJECTS = ["health", "farming", "festivals", "culture", "history", "places in Gujarat", "the home", "science", "the environment", "food", "education", "travel"];
        const calls = Math.ceil(need / 3);
        const costs = await Promise.all(Array.from({ length: calls }, (_, i) =>
          writeFeatures(store, date, Math.min(3, need - 3 * i), { log: say, subjects: SUBJECTS.filter((_, k) => k % calls === i) })
            .catch((e: unknown) => { say(`  features failed (${e instanceof Error ? e.message : e})`); return 0; })));
        if (costs.some((c) => c === null)) return; // no AI key
      }
      return;
    }
    case "build": {
      // the evening's sister papers (server.ts, when that's on): their wording and
      // translations begun now, beside this layout -- ready when they're made
      if (by === "schedule" && store.setting("editionsAuto", true)) {
        const { prepareEditions, DEFAULT_EDITIONS } = await import("./editorial/copies.ts");
        void timed("sister papers' wording (beside the layout)", () => prepareEditions(store, date, store.setting("editions", DEFAULT_EDITIONS)));
      }
      // (the AI's look at the pages comes after the paper is saved: below)
      let r = await buildIssue(store, date, { log: say, progress, reviewLater: true });
      // the layout's own parts, for the time meter
      const tm = r.report.timing;
      if (tm) {
        for (const [label, ms] of [["preparing", tm.preparing ?? 0], ["planning", tm.planning], ["fitting", tm.fitting], ["printing", tm.print],
                                   ["checks", tm.checks]] as const) {
          if (ms > 500) part(label, ms / 1000);
        }
      }
      // what the checks found, mended here and checked again: a number its
      // source doesn't have, written again without it; a page's layout failing
      // a check, the paper laid out each of the other ways in turn (MENDS) until
      // one is clean. The best of them all is the paper; what can't be mended is
      // left for the editor, in the report.
      const began = Date.now();
      type Way = (typeof MENDS)[number] | null;
      let way: Way = null;
      let best: { way: Way; bad: number } = { way, bad: badness(r.report) };
      for (let round = 1; best.bad > 0 && Date.now() - began < MEND_MINUTES * 60_000; round++) {
        const failing = r.report.gates.filter((g) => !g.pass);
        const layout = failing.filter((g) => REPAIR_BY_LAYOUT.test(g.gate));
        let mended = 0;
        if (failing.some((g) => g.gate.startsWith("6 "))) {
          const { repairFacts } = await import("./editorial/repair.ts");
          mended = await timed(`mending numbers ${round}`, () => repairFacts(store, date, say));
        }
        // (a story written again is laid out the best way so far; a layout failing, the next way)
        const next: Way | undefined = layout.length ? MENDS[MENDS.indexOf(way!) + 1] : mended ? best.way : undefined;
        if (next === undefined) break;
        way = next;
        const w = way;
        say(`mending ${round}: ${[...layout.map((g) => g.gate.replace(/^\S+ /, "")), ...(mended ? [`${mended} story(ies) written again`] : [])].join("; ")}` +
            ` -- laying out again${w ? `: ${w.why}` : ""}`);
        r = await timed(`laying out again ${round}`, () => buildIssue(store, date, { log: say, progress, reviewLater: true, seedShift: w?.seedShift ?? 0, ...(w?.mend ? { mend: w.mend } : {}) }));
        const bad = badness(r.report);
        // (a story written again: every way before it was laid out from the old words)
        if (bad < best.bad || mended) best = { way, bad };
      }
      // the best way the paper came out, made again if a later one was worse
      // (the same inputs, the same paper: gate 7)
      if (badness(r.report) > best.bad) {
        say(`the best of the tries was ${best.way ? best.way.why : "the first"}: laid out that way again`);
        const b = best.way;
        r = await timed("the best try again", () => buildIssue(store, date, { log: say, progress, reviewLater: true, seedShift: b?.seedShift ?? 0, ...(b?.mend ? { mend: b.mend } : {}) }));
      }
      const version = (r.report as { version?: number }).version;
      say(`issue ${r.report.issueNumber} v${version ?? "?"}: ${r.report.ready ? "READY" : "NOT READY"} (the page review follows)`);
      // the page review, after the paper is saved: it only reports, so the paper is ready meanwhile
      if (version) {
        const { reviewSaved } = await import("./build.ts");
        // (the newsroom looks again while gate 5 says it's running)
        void reviewSaved(store, date, version).catch(() => {});
      }
      return;
    }
  }
}

/** Run the day from `from` (the first step by default). Throws if a job is already running. */
export async function runPipeline(store: Store, date: string, opts: { by: Job["by"]; from?: StepName; log?: (s: string) => void }): Promise<Job> {
  if (running) throw new Error(`a run for ${running.date} is still going`);
  const first = STEPS.indexOf(opts.from ?? "fetch");
  const steps: JobStep[] = STEPS.map((name, i) => ({ name, status: i < first ? "skipped" : "waiting", log: [] }));
  const job = store.newJob(date, { date, by: opts.by, status: "running", startedAt: new Date().toISOString(), steps });
  running = job;
  stopping = false;
  const letSleep = keepAwake();
  const emit = (line?: string) => { store.putJob(job); for (const fn of listeners) fn(job, line); };
  emit();
  // (the hourly collection finishing first: it was writing the same day's stories)
  if (collecting.current) {
    opts.log?.("  waiting for the hourly collection to finish");
    await collecting.current;
  }
  try {
    for (const s of job.steps) {
      if (s.status === "skipped") continue;
      checkStop();
      s.status = "running";
      s.startedAt = new Date().toISOString();
      emit();
      const say = (line: string) => {
        checkStop();
        s.log.push(line);
        opts.log?.(`  [${s.name}] ${line}`);
        emit(line);
      };
      // progress as it comes, sent at most twice a second (a story a second is plenty)
      let lastSent = 0;
      const progress = (p: Progress) => {
        checkStop();
        s.progress = p;
        if (Date.now() - lastSent > 500 || p.done === p.total) { lastSent = Date.now(); emit(); }
      };
      try {
        const part = (name: string, seconds: number) => { (s.parts ??= []).push({ name, seconds: Math.round(seconds * 10) / 10 }); emit(); };
        const timed: Timed = async (name, job) => {
          const t = Date.now();
          try { return await job(); } finally { part(name, (Date.now() - t) / 1000); }
        };
        await step(store, date, s.name, say, progress, timed, part, job.by);
        // (the AI's money run out shows on Today: 30 Oct, the screen only said to press "Make it again")
        const { aiMoney } = await import("./editorial/rewrite.ts");
        if (aiMoney()) store.putSetting("aiOutOfMoney", aiMoney() === "out");
        s.status = "done";
      } catch (e) {
        s.status = "failed";
        s.error = stopping ? STOPPED : e instanceof Error ? e.message : String(e);
        job.status = "failed";
        throw e;
      } finally {
        s.endedAt = new Date().toISOString();
        emit();
      }
    }
    job.status = "done";
    return job;
  } finally {
    job.endedAt = new Date().toISOString();
    // the run's time record, step by step, in its log (the slowest is the one to work on)
    const secs = (a?: string, b?: string) => (a && b ? (Date.parse(b) - Date.parse(a)) / 1000 : 0);
    const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
    const ran = job.steps.filter((x) => x.startedAt && x.endedAt);
    if (ran.length) {
      const line = `time: ${ran.map((x) => `${x.name} ${clock(secs(x.startedAt, x.endedAt))}`).join(", ")} -- ${clock(secs(job.startedAt, job.endedAt))} in all`;
      ran[ran.length - 1].log.push(line);
      opts.log?.(`  ${line}`);
    }
    running = null;
    stopping = false;
    letSleep();
    emit();
  }
}
