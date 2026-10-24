// The newsroom's link to the backend on this computer (backend/src/server.ts).
// The browser calls it directly: both run here, on 127.0.0.1.

export type StepName = "fetch" | "rewrite" | "topup" | "fill" | "build";
export interface Progress { done: number; total: number; label: string; item?: string }
export interface JobStep { name: StepName; status: "waiting" | "running" | "done" | "failed" | "skipped"; startedAt?: string; endedAt?: string; log: string[]; error?: string; progress?: Progress;
  /** how long its parts took (seconds), as they finish */
  parts?: { name: string; seconds: number }[] }
export interface Job { id: number; date: string; by: string; status: "running" | "done" | "failed"; startedAt: string; endedAt?: string; steps: JobStep[] }
export interface Gate { gate: string; pass: boolean; detail: string }
export interface Report {
  date: string; version: number; issueNumber: number; pages: number; ready: boolean; cost: number; gates: Gate[];
  placed: { page: number; story: string; headline: string; cols: number; rank: number; source: string }[];
  leftOut: { id: string; headline: string; reason?: string }[];
  /** the AI editorial plan's rank and reason per story */
  plan?: { id: string; rank: number; reason: string }[];
  whiteSpace?: { page: number; col: number; height: number; y: number }[];
}
export interface IssueInfo { date: string; version: number; status: string; report: Report }
export interface Status {
  today: string; now: string; runAt: string; autoRun: boolean; nextRun: string | null;
  running: Job | null; lastJob: Job | null; openrouterKey: boolean;
  lang: "gu" | "en"; onboarded: boolean; inrPerUsd: number; inrAuto: boolean; inrUpdated: string; notify: boolean; siteUrl: string;
  issue: { version: number; status: string; ready?: boolean; issueNumber?: number } | null; version: string;
  /** the paper this newsroom is working on */
  paper: { id: string; name: string };
}
export interface ArchiveRow { date: string; version: number; status: string; issueNumber?: number; ready?: boolean; cost?: number; stories: number; pages?: number }
export interface ReleaseRow {
  id: number; source: string; lang: string; ministry: string; headline: string; url: string; photos: string[]; body: string;
  story: string | null; inPaper: boolean; translated: boolean; roundUp: boolean;
}
export interface StoryRow {
  id: string; releaseId: number | null; date: string; kicker: string; headline: string; deck: string;
  bodies: { long: string; medium: string; short: string }; priority: number; photo: string | null; photos?: string[];
  caption: string; source: string; model: string; factCheck?: string; translatedFrom?: string; mergedFrom?: number[];
  dropped: boolean; edited: boolean; page: number | null; cols: number | null; fullWidth?: boolean;
}
export interface AdRow { id: string; date: string; page: number; width: number; height: number; url: string;
  /** a stand-in from the reference issue, not a booking */
  sample: boolean;
  /** every day the booking runs */
  days: string[] }
export interface Settings { runAt: string; autoRun: boolean; openrouterKey: boolean; lang: "gu" | "en"; onboarded: boolean; inrPerUsd: number;
  inrAuto: boolean; inrUpdated: string; notify: boolean; siteUrl: string; editions: Edition[]; editionsAuto: boolean }
/** A language the paper's copies and sister papers come in. */
export type PaperLang = "gu" | "hi" | "ur";
/** A sister paper: the day's paper under another name, maybe in another language. */
export interface Edition { id: string; name: string; lang: PaperLang }
/** The page in centimetres, its columns, each page's room for stories (/api/layout). */
export interface PageLayout { widthCm: number; heightCm: number; columns: number; leftCm: number; columnCm: number; gutterCm: number;
  pages: { page: number; topCm: number; bottomCm: number }[] }
export type Reword = "headline" | "headlineDeck" | "all";
export type Shuffle = "keepLead" | "anywhere" | "samePage";
export interface CopiesRun { kind: "copies" | "editions"; date: string; count: number; reword: Reword; shuffle: Shuffle; lang: PaperLang;
  status: "running" | "done" | "failed" | "stopped"; startedAt: string; endedAt?: string; done: number;
  files: { n: number; id?: string; name?: string; lang: PaperLang; ready: boolean; pages: number }[]; cost: number; log: string[]; error?: string;
  /** how far it has got, 0-1, page by page; and each copy's own progress and what it's doing */
  share?: number; parts?: Record<string, { share: number; what: string }>;
  /** the time meter: the wording, and each one's layout (seconds) */
  times?: { name: string; seconds: number }[] }

/** A batch's share done (0-1), and minutes left from how fast it has gone so far (or `guess` before it knows). */
export function batchProgress(run: CopiesRun, guess: number): { share: number; minutes: number } {
  const share = run.share ?? run.done / Math.max(1, run.count);
  const elapsed = (Date.now() - Date.parse(run.startedAt)) / 60_000;
  const minutes = share > 0.05 ? (elapsed * (1 - share)) / share : Math.max(1, guess - elapsed);
  return { share, minutes: Math.max(1, Math.round(minutes)) };
}

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

/** A file the backend serves (page images, photos, the PDF) -- or, for the
 * paper's own art (/chrome/..., /fonts/...), one the newsroom serves itself. */
export const media = (path: string) => (/^https?:/.test(path) ? path : /^\/(media|api)\//.test(path) ? `${BACKEND}${path}` : path);
