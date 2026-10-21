// Static mode (BACKEND_API_MODE=static): the website has no backend to call.
// Issues are built on the paper's own machine and published as plain files
// into public/issues/ (backend/src/publish.ts, `cli.ts publish`): page
// images, the print PDF and a small issue.json -- which this reads.
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface PublishedIssue {
  issueDate: string;
  issueNumber: number;
  version: number;
  publishedAt: string;
  ready: boolean;
  pages: { number: number; width: number; height: number; image: string }[];
  dpi: number;
  pdf: string;
  gates: { gate: string; pass: boolean; detail: string }[];
  warnings: { page: number; elementId?: string; kind: string; detail: string }[];
}

export interface PublishedIndex {
  latest?: string;
  dates: string[];
}

// next.config.ts traces public/issues/**/*.json into the server build, so
// these reads work on a serverless host too
const ISSUES_DIR = path.join(process.cwd(), "public", "issues");

export async function readIndex(): Promise<PublishedIndex> {
  try {
    return JSON.parse(await readFile(path.join(ISSUES_DIR, "index.json"), "utf8")) as PublishedIndex;
  } catch {
    return { dates: [] };
  }
}

/** A published day (the latest without `date`), or null if there is none. */
export async function readPublished(date?: string): Promise<PublishedIssue | null> {
  const index = await readIndex();
  const day = date && index.dates.includes(date) ? date : index.latest;
  if (!day) return null;
  return JSON.parse(await readFile(path.join(ISSUES_DIR, day, "issue.json"), "utf8")) as PublishedIssue;
}
