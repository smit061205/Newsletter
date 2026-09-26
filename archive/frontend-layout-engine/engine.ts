// Runs the one layout engine (scripts/layout/engine.py) that both the
// website and the print PDF are drawn from. The engine fetches the issue from
// `issueUrl` (this app's own /api/issue, which wraps fetchIssue() + Zod), lays
// out every page, and caches the result on disk keyed by the issue JSON -- so
// repeated calls for the same issue are cheap.
import { spawn } from "node:child_process";
import path from "node:path";

// `next dev` runs with cwd = web/ (launch.json uses `npm --prefix web`), but
// resolve both cases rather than assume.
const cwd = process.cwd();
export const PROJECT_ROOT = cwd.endsWith(`${path.sep}web`) ? path.resolve(cwd, "..") : cwd;
const ENGINE = path.join(PROJECT_ROOT, "scripts", "layout", "engine.py");

export interface EngineWarning {
  id: string;
  kind: "overflow" | "underflow" | "missing-image";
  detail: string;
  leftover?: string;
}

export interface EngineResult {
  dir: string;
  pages: number;
  warnings: EngineWarning[];
}

// Every page of the website asks for the layout at once (one iframe per
// page); share one engine run per issue URL instead of racing N of them to
// write the same cache directory.
const inFlight = new Map<string, Promise<EngineResult>>();

export function runEngine(issueUrl: string): Promise<EngineResult> {
  const pending = inFlight.get(issueUrl);
  if (pending) return pending;
  const run = new Promise<EngineResult>((resolve, reject) => {
    const proc = spawn("python3", [ENGINE, "--url", issueUrl]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`layout engine exited ${code}\n${stderr}`));
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop() ?? ""));
      } catch {
        reject(new Error(`layout engine returned unreadable output\n${stdout}\n${stderr}`));
      }
    });
  }).finally(() => inFlight.delete(issueUrl));
  inFlight.set(issueUrl, run);
  return run;
}
