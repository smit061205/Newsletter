// Numbers, money, dates and check results in the editor's words.
import type { Gate } from "../api";
import { tr, type Lang, type StringKey } from "./strings";

const GU_DIGITS = "૦૧૨૩૪૫૬૭૮૯";
/** A number in the language's digits. */
export const num = (lang: Lang, n: number | string) => (lang === "gu" ? String(n).replace(/[0-9]/g, (d) => GU_DIGITS[Number(d)]) : String(n));

/** An AI cost (reported in US dollars) in rupees. */
export function rupees(lang: Lang, usd: number | undefined, rate: number): string {
  const r = (usd ?? 0) * rate;
  const text = r < 10 ? r.toFixed(2) : r.toFixed(r < 100 ? 1 : 0);
  return `₹${num(lang, text)}`;
}

/** "ગુરુવાર, 22 ઑક્ટોબર" / "Thursday, 22 October" */
export function longDate(lang: Lang, iso: string, withYear = false): string {
  const d = new Date(`${iso}T12:00:00`);
  return num(lang, d.toLocaleDateString(lang === "gu" ? "gu-IN" : "en-IN", { weekday: "long", day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) }));
}
export const shortDate = (lang: Lang, iso: string) =>
  num(lang, new Date(`${iso}T12:00:00`).toLocaleDateString(lang === "gu" ? "gu-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" }));

/** The ISO day `n` days from `iso`. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A check's name in plain words. */
export function checkName(lang: Lang, gate: string): string {
  const k = gate.split(" ")[0];
  if (k === "3") return tr(lang, /tombstone/.test(gate) ? "check.3a" : /importance/.test(gate) ? "check.3b" : "check.3c");
  const key = `check.${k}` as StringKey;
  return tr(lang, key);
}

export interface Problem { kind: "numbers" | "space" | "review" | "layout" | "other"; text: string; story?: string; page?: number }

/** The checks that failed, as things the editor can look at, in plain words. */
export function problems(lang: Lang, gates: Gate[], headlineOf: (id: string) => string | undefined): Problem[] {
  const out: Problem[] = [];
  for (const g of gates.filter((x) => !x.pass)) {
    const k = g.gate.split(" ")[0];
    if (k === "6") {
      for (const part of g.detail.split("; ")) {
        const m = part.match(/^(\S+): .*?: (.+)$/);
        if (m) out.push({ kind: "numbers", story: m[1], text: tr(lang, "issue.numbers", { headline: headlineOf(m[1]) ?? m[1], nums: num(lang, m[2]) }) });
      }
    } else if (k === "2") {
      out.push({ kind: "space", text: tr(lang, "issue.space") });
    } else if (k === "5") {
      for (const part of g.detail.split("; ")) {
        const m = part.match(/^p(\d+) \S+ "[^"]*": (.+)$/);
        if (m) out.push({ kind: "review", page: Number(m[1]), text: tr(lang, "issue.review", { page: num(lang, m[1]), note: m[2] }) });
      }
      if (!out.some((p) => p.kind === "review")) out.push({ kind: "other", text: checkName(lang, g.gate) });
    } else if (k === "1") {
      out.push({ kind: "layout", text: tr(lang, "issue.overlap") });
    } else {
      out.push({ kind: "other", text: checkName(lang, g.gate) });
    }
  }
  return out;
}
