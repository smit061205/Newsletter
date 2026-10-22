// The newsroom's link to the backend on this computer (backend/src/server.ts).
// The browser calls it directly: both run here, on 127.0.0.1.

export type StepName = "fetch" | "rewrite" | "topup" | "fill" | "build";
export interface JobStep { name: StepName; status: "waiting" | "running" | "done" | "failed" | "skipped"; startedAt?: string; endedAt?: string; log: string[]; error?: string }
export interface Job { id: number; date: string; by: string; status: "running" | "done" | "failed"; startedAt: string; endedAt?: string; steps: JobStep[] }
export interface Gate { gate: string; pass: boolean; detail: string }
export interface Report {
  date: string; version: number; issueNumber: number; pages: number; ready: boolean; cost: number; gates: Gate[];
  placed: { page: number; story: string; headline: string; cols: number; rank: number; source: string }[];
  leftOut: { id: string; headline: string; reason?: string }[];
  /** the AI editorial plan's rank and reason per story */
  plan?: { id: string; rank: number; reason: string }[];
}
export interface IssueInfo { date: string; version: number; status: string; report: Report }
export interface Status {
  today: string; now: string; runAt: string; autoRun: boolean; nextRun: string | null;
  running: Job | null; lastJob: Job | null; openrouterKey: boolean;
  issue: { version: number; status: string; ready?: boolean } | null; version: string;
}
export interface ReleaseRow {
  id: number; source: string; lang: string; ministry: string; headline: string; url: string; photos: string[]; body: string;
  story: string | null; inPaper: boolean; translated: boolean; roundUp: boolean;
}
export interface StoryRow {
  id: string; releaseId: number | null; date: string; kicker: string; headline: string; deck: string;
  bodies: { long: string; medium: string; short: string }; priority: number; photo: string | null; photos?: string[];
  caption: string; source: string; model: string; factCheck?: string; translatedFrom?: string; mergedFrom?: number[];
  dropped: boolean; edited: boolean; page: number | null; cols: number | null;
}
export interface AdRow { id: string; date: string; page: number; width: number; height: number; url: string }
export interface Settings { runAt: string; autoRun: boolean; openrouterKey: boolean }

export const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:4000";

/** A backend call; its error message (in plain words) when it fails. */
export async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND}${path}`, {
      ...init,
      ...(init?.json !== undefined ? { method: init.method ?? "POST", body: JSON.stringify(init.json), headers: { "content-type": "application/json" } } : {}),
    });
  } catch {
    throw new Error("The Capital Kranti engine isn't answering. Open the Capital Kranti app (or restart the computer) and try again.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || `the engine answered ${res.status}`);
  return data as T;
}

/** A file the backend serves (page images, photos, the PDF). */
export const media = (path: string) => (/^https?:/.test(path) ? path : `${BACKEND}${path}`);

export const STEP_LABEL: Record<StepName, [string, string]> = {
  fetch: ["ગુજરાતી સમાચાર", "Gujarati news from PIB"],
  rewrite: ["લેખન", "Written in the paper's style"],
  topup: ["હિન્દી અનુવાદ", "Hindi news translated"],
  fill: ["વિશેષ લેખ", "Features, if still short"],
  build: ["પાનાં", "Pages laid out and checked"],
};

/** A gate's name in plain words for the editor. */
export function gateLabel(g: string): string {
  const k = g.split(" ")[0];
  if (k === "3") return /tombstone/.test(g) ? "No headlines side by side" : /importance/.test(g) ? "Bigger news, bigger headline" : "No oversized headline";
  const plain: Record<string, string> = {
    "1": "Nothing overflows or overlaps", P: "Ready for the printer", F: "Every letter in the paper's fonts", "2": "No empty space on the pages", "4": "Every story placed",
    "5": "AI page review", "6": "Numbers match the releases", "7": "Same result on a rebuild", S1: "Even word spacing",
    S2: "Headlines fill their width", S4: "Columns end level", S5: "Enough news for the pages", S6: "Gujarati digits", S7: "Headline, sub-heading, text",
  };
  return plain[k] ?? g;
}
