// What every part of the engine's API shares: answering, reading a request,
// who may talk to the engine (server.ts), and the day and time in India.
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { StepName, Store } from "../store.ts";

/** Answer a request; true (it's answered: the routes return it). */
export function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): true {
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body));
  return true;
}

// Who may talk to the engine (5 Nov: every website was let in, public pages too, so any page open in
// the editor's browser could start a paid run, change his AI key or Telegram bot, delete ads or read
// the bot's code). Only the newsroom may send it changes or read its answers; on this computer it
// answers only to its own address, so a website can't pose as it (a name pointed at 127.0.0.1).
export const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
/** The newsroom's addresses (the app's and development's), the engine's own, and any in CK_NEWSROOM_ORIGIN. */
export function newsroomOrigins(port: number): Set<string> {
  const extra = (process.env.CK_NEWSROOM_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return new Set([...[port, 3000, 3100].flatMap((p) => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]), ...extra]);
}
/** The release reader's own key: only its page knows it, so no other website can hand the engine a release. */
export function readerKey(store: Store): string {
  let key = store.setting("readerKey", "");
  if (!key) { key = randomBytes(16).toString("hex"); store.putSetting("readerKey", key); }
  return key;
}
export const sameKey = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/** Now in India: the day and the time ("HH:MM"). */
export function indiaNow(): { day: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}` };
}

/** Does this request carry the API token (or is none configured)? */
export function authorized(req: IncomingMessage): boolean {
  const token = process.env.BACKEND_API_TOKEN?.trim();
  return !token || req.headers.authorization === `Bearer ${token}`;
}

/** One request, for an area's routes (api/*.ts): each answers it and returns
 * true, or leaves it to the next. */
export interface Ctx {
  store: Store;
  log: (s: string) => void;
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  /** the path's parts: /api/issues/2026-11-05 -> ["api", "issues", "2026-11-05"] */
  parts: string[];
  /** start a run of the day in the background and answer with its job (server.ts) */
  startJob: (res: ServerResponse, date: string, from?: StepName) => true;
}
