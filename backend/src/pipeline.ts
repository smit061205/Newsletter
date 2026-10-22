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
import type { Job, JobStep, StepName, Store } from "./store.ts";

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
/** The job running now, if any: one at a time. */
export const currentJob = () => running;

async function step(store: Store, date: string, name: StepName, say: (s: string) => void) {
  switch (name) {
    case "fetch": {
      const { ingestPib } = await import("./ingest/pib.ts");
      const r = await ingestPib(store, date, "gu", { log: say });
      say(`${r.listed} listed, ${r.fetched} new, ${r.skipped} already stored`);
      if (!store.releases(date).length) throw new Error(`PIB has no Gujarati releases for ${date} yet`);
      return;
    }
    case "rewrite": {
      const { rewriteDay } = await import("./editorial/rewrite.ts");
      return rewriteDay(store, date, { log: say });
    }
    case "topup": {
      const { topUp } = await import("./editorial/translate.ts");
      await topUp(store, date, { log: say });
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
      const r = await buildIssue(store, date, { log: say });
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
  const letSleep = keepAwake();
  const emit = (line?: string) => { store.putJob(job); for (const fn of listeners) fn(job, line); };
  emit();
  try {
    for (const s of job.steps) {
      if (s.status === "skipped") continue;
      s.status = "running";
      s.startedAt = new Date().toISOString();
      emit();
      const say = (line: string) => {
        s.log.push(line);
        opts.log?.(`  [${s.name}] ${line}`);
        emit(line);
      };
      try {
        await step(store, date, s.name, say);
        s.status = "done";
      } catch (e) {
        s.status = "failed";
        s.error = e instanceof Error ? e.message : String(e);
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
    letSleep();
    emit();
  }
}
