// The engine's AI: OpenRouter's free models only (decided 25 Oct: ₹0; never
// Anthropic, CLAUDE.md). Which free models exist changes, so each run asks
// OpenRouter's model list and keeps the ones the site's settings name first
// (site/lib/config.ts), then any other free model with a long enough context.
// Every request is counted against the day's free allowance (shared with the
// hourly run's translations); past it, nothing more is asked until tomorrow.
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { WEBSITE } from "../lib/config.ts";
import { count } from "../lib/write.ts";

type Sql = NeonQueryFunction<false, false>;
const KEY = process.env.OPENROUTER_API_KEY ?? "";
/** the free models allow 20 requests a minute */
const GAP_MS = 3200;

let models: string[] | null = null;
let last = 0;
let usedThisRun = 0;
export const aiUsed = () => usedThisRun;
/** Free models are shared by everyone: one its provider says is busy ("temporarily
 * rate-limited upstream", 25 Oct: both Gemma models for half an hour) is set
 * aside for the rest of the run, not retried, and the next one is asked. */
const resting = new Map<string, number>();
const REST_MS = 10 * 60_000;
export const restingModels = () => [...resting.keys()];

/** One request, once: no retrying here (the caller moves to the next model). */
async function call(model: string, body: Record<string, unknown>, seconds: number): Promise<Response> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(seconds * 1000),
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", "http-referer": WEBSITE.url, "x-title": "Capital Kranti website" },
      body: JSON.stringify({ model, ...body }),
    });
    return new Response(await res.text(), { status: res.status });
  } catch (e) {
    return new Response(`no answer in ${seconds}s (${e instanceof Error ? e.message : e})`, { status: 504 });
  }
}

/** The free models to use, best first: never a paid one (the id ends ":free" and its price is 0). */
export async function freeModels(): Promise<string[]> {
  if (models) return models;
  const named = [...WEBSITE.freeModels];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(20_000) });
    const all = ((await res.json()) as { data: { id: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[] }).data;
    const free = all.filter((m) => m.id.endsWith(":free") && Number(m.pricing?.prompt ?? 1) === 0 && Number(m.pricing?.completion ?? 1) === 0);
    const ids = new Set(free.map((m) => m.id));
    const others = free.filter((m) => !named.includes(m.id) && (m.context_length ?? 0) >= 16_000 && !/anthropic|claude|vision|embed|guard/i.test(m.id))
      .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0)).map((m) => m.id);
    models = [...named.filter((id) => ids.has(id)), ...others].slice(0, 10);
  } catch {
    models = named;
  }
  if (!models.length) models = named;
  return models;
}

export interface Ask {
  system: string;
  user: string;
  /** "writer" starts from the first model; "checker" from the second, so a
   * story is checked by a different model from the one that wrote it */
  role?: "writer" | "checker";
  /** a model to avoid (the one that wrote what's being checked) */
  avoid?: string;
  temperature?: number;
  maxTokens?: number;
}
export type AiResult<T> = { ok: true; value: T; model: string } | { ok: false; why: string; stop?: boolean };

/** One JSON answer from the free models, tried in order until one gives valid JSON that `check` accepts. */
export async function askJson<T>(sql: Sql | null, a: Ask, check: (v: unknown) => T | null): Promise<AiResult<T>> {
  if (!KEY) return { ok: false, why: "no OPENROUTER_API_KEY", stop: true };
  const list = await freeModels();
  const order = a.role === "checker" && list.length > 1 ? [...list.slice(1), list[0]] : list;
  let why = "no free model answered";
  const awake = order.filter((m) => (resting.get(m) ?? 0) < Date.now());
  const tryList = awake.filter((m) => m !== a.avoid).concat(a.avoid && awake.includes(a.avoid) && awake.length === 1 ? [a.avoid] : []);
  if (!tryList.length) return { ok: false, why: "every free model is busy for now" };
  for (const model of tryList) {
    if (sql && (await count(sql, "ai_free", 0)) >= WEBSITE.dailyFreeRequests) return { ok: false, why: "the day's free AI requests are used up", stop: true };
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    usedThisRun++;
    if (sql) await count(sql, "ai_free");
    const res = await call(model, {
      temperature: a.temperature ?? 0.2, max_tokens: a.maxTokens ?? 3000, response_format: { type: "json_object" },
      messages: [{ role: "system", content: a.system }, { role: "user", content: a.user }],
    }, 120);
    if (!res.ok) {
      why = `${model}: ${res.status} ${(await res.text()).slice(0, 160)}`;
      // the day's free allowance is the account's: a 429 that says so stops the run's AI
      if (res.status === 429 && /per-day|free-models-per-day/i.test(why)) return { ok: false, why, stop: true };
      // busy, gone, or too slow: set aside for a while, ask the next
      if ([404, 408, 429, 502, 503, 504].includes(res.status)) resting.set(model, Date.now() + REST_MS);
      continue;
    }
    const text = ((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { why = `${model}: not the JSON asked for`; continue; }
    const value = check(parsed);
    if (value !== null) return { ok: true, value, model };
    why = `${model}: JSON without what was asked for`;
  }
  return { ok: false, why };
}

/** Requests left today. */
export async function aiLeft(sql: Sql): Promise<number> {
  return WEBSITE.dailyFreeRequests - (await count(sql, "ai_free", 0));
}
