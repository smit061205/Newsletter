// The runs the engine keeps in line: days to lay out again when the run going
// ends, and days to make again once their copies or sister papers are done.
import type { StepName } from "../store.ts";


/** Days to lay out again once the run that's going ends (edits made meanwhile). */
export const afterRun = new Set<string>();
/** Days to make again once their copies or sister papers are done, and the step to start from. */
export const afterBatch = new Map<string, StepName | undefined>();

/** The copies or sister papers being made, if any (editorial/copies.ts; loaded when the engine starts). */
let copies: (() => { date: string; kind: "copies" | "editions" } | null) | undefined;
export const copiesNow = () => copies?.() ?? null;
export async function loadCopies() { copies = (await import("../editorial/copies.ts")).currentCopies; }
