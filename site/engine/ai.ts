// The engine's AI: free Gemma models only (decided 25 Oct: free, ₹0, and Gemma;
// never Anthropic, CLAUDE.md), by two routes, best first:
//   1. Google's own Gemini API with the paper's free AI Studio key (GOOGLE_AI_KEY):
//      its own free quota, so not the crowd's (added 26 Oct, after OpenRouter's
//      shared free Gemma was "rate-limited upstream" for five hours straight);
//   2. OpenRouter's free Gemma (OPENROUTER_API_KEY), shared by all its users.
// Which Gemmas each route has changes, so each run asks both for their list and
// keeps the ones the site's settings name first (site/lib/config.ts). A model is
// named "google:<id>" or by its OpenRouter id. Every request is counted against
// its route's daily allowance (shared with the hourly run's translations).
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { WEBSITE } from "../lib/config.ts";
import { count } from "../lib/write.ts";

type Sql = NeonQueryFunction<false, false>;
const KEY = process.env.OPENROUTER_API_KEY ?? "";
const GOOGLE_KEY = process.env.GOOGLE_AI_KEY ?? "";
const GOOGLE = "https://generativelanguage.googleapis.com/v1beta";
const isGoogle = (m: string) => m.startsWith("google:");
/** extra length for Gemma's thinking, on top of the answer's own */
const GOOGLE_THINKING_ROOM = 8192;
/** how much Gemma may think: set from what aiprobe.ts found the model accepts (none = its default) */
const GOOGLE_THINKING: Record<string, unknown> | null = process.env.CK_GOOGLE_THINKING ? JSON.parse(process.env.CK_GOOGLE_THINKING) : null;
/** which daily allowance a model's requests count against */
const counter = (m: string) => (isGoogle(m) ? "ai_google" : "ai_free");
const ceiling = (m: string) => (isGoogle(m) ? WEBSITE.dailyGoogleRequests : WEBSITE.dailyFreeRequests);
/** the free routes allow 20-30 requests a minute */
const GAP_MS = 2500;

let models: string[] | null = null;
let last = 0;
let usedThisRun = 0;
export const aiUsed = () => usedThisRun;
/** Free models are shared by everyone: one its provider says is busy ("temporarily
 * rate-limited upstream", 25 Oct: both Gemma models for half an hour) is set
 * aside for the rest of the run, not retried, and the next one is asked. */
const resting = new Map<string, number>();
const REST_MS = 3 * 60_000;
export const restingModels = () => [...resting.keys()];

/** One request to Google, once, its answer returned in OpenRouter's shape. Gemma
 * on the Gemini API takes no system instruction and no JSON mode, so the
 * instructions lead the prompt and the JSON is read from the text. */
async function callGoogle(model: string, a: { system: string; user: string; temperature: number; maxTokens: number }, seconds: number): Promise<Response> {
  try {
    const res = await fetch(`${GOOGLE}/models/${model.slice(7)}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(seconds * 1000),
      headers: { "x-goog-api-key": GOOGLE_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${a.system}\n\n---\n\n${a.user}` }] }],
        // Gemma 4 thinks before it answers, and its thinking counts against the length: room for both,
        // and the thinking kept short where the model takes the setting (26 Oct: 3,500 tokens went on
        // thinking and the answer came back empty)
        generationConfig: { temperature: a.temperature, maxOutputTokens: a.maxTokens + GOOGLE_THINKING_ROOM,
                            ...(GOOGLE_THINKING ? { thinkingConfig: GOOGLE_THINKING } : {}) },
      }),
    });
    const text = await res.text();
    if (!res.ok) return new Response(text, { status: res.status });
    const g = JSON.parse(text) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
    const c = g.candidates?.[0];
    const content = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: c?.finishReason?.toLowerCase() }] }), { status: 200 });
  } catch (e) {
    return new Response(`no answer in ${seconds}s (${e instanceof Error ? e.message : e})`, { status: 504 });
  }
}

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

/** Google's Gemmas for this key, the site's named ones first, then other big enough ones. */
async function googleModels(): Promise<string[]> {
  if (!GOOGLE_KEY) return [];
  try {
    const res = await fetch(`${GOOGLE}/models?pageSize=200`, { headers: { "x-goog-api-key": GOOGLE_KEY }, signal: AbortSignal.timeout(20_000) });
    const all = ((await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }).models ?? [];
    const ids = all.filter((m) => /gemma/i.test(m.name) && (m.supportedGenerationMethods ?? []).includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
    const big = (id: string) => Number(id.match(/(\d+)b/)?.[1] ?? 0) >= 12;
    const named = WEBSITE.googleModels.filter((id) => ids.includes(id));
    return [...named, ...ids.filter((id) => !named.includes(id) && big(id))].slice(0, 4).map((id) => `google:${id}`);
  } catch {
    return WEBSITE.googleModels.map((id) => `google:${id}`);
  }
}

/** The free models to use, best first: Google's (the paper's own quota), then
 * OpenRouter's free ones (never a paid one: the id ends ":free" and its price is 0). */
export async function freeModels(): Promise<string[]> {
  if (models) return models;
  const google = await googleModels();
  const named = [...WEBSITE.freeModels];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(20_000) });
    const all = ((await res.json()) as { data: { id: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[] }).data;
    const free = all.filter((m) => m.id.endsWith(":free") && Number(m.pricing?.prompt ?? 1) === 0 && Number(m.pricing?.completion ?? 1) === 0);
    const ids = new Set(free.map((m) => m.id));
    // Gemma only (the user's choice, 25 Oct)
    const others = free.filter((m) => !named.includes(m.id) && /gemma/i.test(m.id) && (m.context_length ?? 0) >= 16_000)
      .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0)).map((m) => m.id);
    models = [...named.filter((id) => ids.has(id)), ...others].slice(0, 10);
  } catch {
    models = named;
  }
  models = models.filter((m) => /gemma/i.test(m));
  if (!models.length) models = named;
  if (!KEY) models = [];
  models = [...google, ...models];
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
  /** ask only this model (aiprobe.ts) */
  only?: string;
  temperature?: number;
  maxTokens?: number;
}
export type AiResult<T> = { ok: true; value: T; model: string } | { ok: false; why: string; stop?: boolean; busy?: boolean };

/** One JSON answer from the free models, tried in order until one gives valid JSON that `check` accepts. */
export async function askJson<T>(sql: Sql | null, a: Ask, check: (v: unknown) => T | null): Promise<AiResult<T>> {
  if (!KEY && !GOOGLE_KEY) return { ok: false, why: "no GOOGLE_AI_KEY or OPENROUTER_API_KEY", stop: true };
  const list = await freeModels();
  // the checker starts from the second model of the best route, so it differs from the writer
  const order = a.only ? [a.only] : a.role === "checker" && list.length > 1 ? [list[1], list[0], ...list.slice(2)] : list;
  const whys: string[] = [];
  let why = "no free model answered";
  // every Gemma busy: wait for the first to rest (up to 90 s), else give up for this run
  const soonest = Math.min(...order.map((m) => resting.get(m) ?? 0));
  if (soonest > Date.now() && soonest - Date.now() <= 90_000 && order.every((m) => (resting.get(m) ?? 0) > Date.now())) {
    await new Promise((r) => setTimeout(r, soonest - Date.now()));
  }
  const awake = order.filter((m) => (resting.get(m) ?? 0) < Date.now());
  const tryList = awake.filter((m) => m !== a.avoid).concat(a.avoid && awake.includes(a.avoid) && awake.length === 1 ? [a.avoid] : []);
  if (!tryList.length) return { ok: false, why: "every free model is busy for now", busy: true };
  for (const model of tryList) {
    // a route whose day's allowance is used up is skipped; when every route is, the run's AI stops
    if (sql && (await count(sql, counter(model), 0)) >= ceiling(model)) {
      whys.push(`${model}: its route's free requests for today are used up`);
      if (await aiLeft(sql) <= 0) return { ok: false, why: "the day's free AI requests are used up", stop: true };
      continue;
    }
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    usedThisRun++;
    if (sql) await count(sql, counter(model));
    const res = isGoogle(model)
      ? await callGoogle(model, { system: a.system, user: a.user, temperature: a.temperature ?? 0.2, maxTokens: a.maxTokens ?? 3000 }, 200)
      : await call(model, {
      temperature: a.temperature ?? 0.2, max_tokens: a.maxTokens ?? 3000, response_format: { type: "json_object" },
      // thinking models spend their tokens thinking first: keep it short so the answer fits
      reasoning: { effort: "low", exclude: true },
      messages: [{ role: "system", content: a.system }, { role: "user", content: a.user }],
    }, 120);
    if (!res.ok) {
      why = `${model}: ${res.status} ${(await res.text()).slice(0, 160)}`;
      whys.push(why);
      // a day's allowance used up (OpenRouter's account, or a Google model's per-day quota): that model rests till tomorrow
      if (res.status === 429 && /per-?day|free-models-per-day|PerDay/i.test(why)) { resting.set(model, Date.now() + 24 * 3600_000); continue; }
      // busy, gone, or too slow: set aside for a while, ask the next
      // ("rate-limited upstream" asks to retry shortly: a minute; anything else longer)
      if ([404, 408, 429, 500, 502, 503, 504].includes(res.status)) resting.set(model, Date.now() + (res.status === 429 ? 60_000 : REST_MS));
      continue;
    }
    const answer = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const text = answer.choices?.[0]?.message?.content ?? "";
    const parsed = readJson(text);
    if (parsed === undefined) {
      why = `${model}: not the JSON asked for (${text.length} chars${answer.choices?.[0]?.finish_reason ? `, ${answer.choices[0].finish_reason}` : ""}): ${text.slice(0, 80).replace(/\s+/g, " ")}`;
      whys.push(why);
      continue;
    }
    const value = check(parsed);
    if (value !== null) return { ok: true, value, model };
    why = `${model}: JSON without what was asked for`;
    whys.push(why);
  }
  // nothing but busy or missing models: try again next run, it's not the story's fault
  const busy = whys.length > 0 && whys.every((w) => /: (404|408|429|500|502|503|504) /.test(w));
  return { ok: false, why: whys.join(" | ") || why, busy };
}

/** Free requests left today, over the routes this run has. */
export async function aiLeft(sql: Sql): Promise<number> {
  const google = GOOGLE_KEY ? Math.max(0, WEBSITE.dailyGoogleRequests - (await count(sql, "ai_google", 0))) : 0;
  const open = KEY ? Math.max(0, WEBSITE.dailyFreeRequests - (await count(sql, "ai_free", 0))) : 0;
  return google + open;
}

/** The JSON in a model's answer: the whole of it, or inside a code fence, or
 * the outermost braces; a list cut off part-way is closed after its last
 * complete entry (a long answer that hit its length). Undefined if none. */
export function readJson(text: string): unknown {
  const tries: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) tries.push(fence[1]);
  const start = text.indexOf("{");
  if (start >= 0) tries.push(text.slice(start, text.lastIndexOf("}") + 1), text.slice(start));
  for (const t of tries) {
    try { return JSON.parse(t); } catch { /* next */ }
  }
  // cut off: keep everything up to the last complete "}," inside the first list, then close it
  if (start >= 0) {
    const body = text.slice(start);
    const list = body.indexOf("[");
    for (let end = body.lastIndexOf("}"); end > list && list >= 0; end = body.lastIndexOf("}", end - 1)) {
      try { return JSON.parse(`${body.slice(0, end + 1)}]}`); } catch { /* shorter */ }
    }
  }
  return undefined;
}
