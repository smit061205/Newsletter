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

// PIB not answering (its server down, the internet gone): the fetch waits and
// tries again, every 10 minutes for up to 2 hours, saying so
const RETRY_EVERY_MS = 10 * 60_000;
const RETRIES = 12;

async function step(store: Store, date: string, name: StepName, say: (s: string) => void, progress: (p: Progress) => void) {
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
      let r: Awaited<ReturnType<typeof ingestPib>> | null = null;
      for (let attempt = 0; !r; attempt++) {
        try {
          r = await ingestPib(store, date, feed, { log: say, progress });
        } catch (e) {
          const saved = store.releases(date).length;
          if (past && saved) {
            say(`PIB won't show ${date}'s list now (${e instanceof Error ? e.message : e}): the paper is made from the ${saved} release(s) saved that day`);
            return;
          }
          if (past) throw new Error(`PIB won't show ${date}'s list, and no news was saved that day`);
          if (attempt >= RETRIES) throw e;
          const at = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(Date.now() + RETRY_EVERY_MS);
          say(`PIB isn't answering (${e instanceof Error ? e.message : e}): trying again at ${at}`);
          progress({ done: 0, total: 0, label: "waiting", item: at });
          await waitOrStop(RETRY_EVERY_MS);
        }
      }
      say(`${r.listed} listed, ${r.fetched} new, ${r.skipped} already stored`);
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
      const { fillContext } = await import("./build.ts");
      const ctx = await fillContext(store, date);
      const share = ctx.share();
      await ctx.close();
      if (share >= 1) return say(`the copy fills ${(share * 100).toFixed(0)}% of the pages: no features needed`);
      if (store.stories(date).some((s) => s.id.startsWith("f-"))) return say("the day has its features already");
      const { writeFeatures } = await import("./editorial/features.ts");
      await writeFeatures(store, date, share < 0.85 ? 3 : 2, { log: say });
      return;
    }
    case "build": {
      const r = await buildIssue(store, date, { log: say, progress });
      say(`issue ${r.report.issueNumber} v${(r.report as { version?: number }).version ?? "?"}: ${r.report.ready ? "READY" : "NOT READY"}`);
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
        await step(store, date, s.name, say, progress);
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
    running = null;
    stopping = false;
    letSleep();
    emit();
  }
}
