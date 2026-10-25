// The website's hourly run (.github/workflows/site-run.yml), on GitHub's
// servers. Phase A (docs/website/ROADMAP.md §6):
//   1. records the run, and how late GitHub started it (the "how live" test);
//   2. asks PIB, the CM's office and All India Radio for a page each, as the
//      engine would (the "does PIB answer GitHub" test), and records what came back;
//   3. gives each new story its section (Gujarat, India, World) and topics,
//      and writes its English version, with a free model from the paper's
//      profile; every number in the English is checked against the Gujarati.
// Run: node --experimental-strip-types site/pipeline/run.ts   (DATABASE_URL, OPENROUTER_API_KEY)
import { neon } from "@neondatabase/serverless";
import { numbersNotIn, openRouter } from "../../backend/src/editorial/rewrite.ts";
import { profile } from "../../backend/src/profile.ts";
import { ensureSchema } from "../lib/schema.ts";
import { count } from "../lib/write.ts";
import type { English, Genre, Tier } from "../lib/types.ts";

const sql = neon(required("DATABASE_URL"));
const KEY = process.env.OPENROUTER_API_KEY ?? "";
const TIERS: Tier[] = ["gujarat", "india", "world"];
const GENRES: Genre[] = ["farm", "economy", "tech", "health", "sport", "education", "entertainment"];
const UA = "CapitalKranti-news-ingest/1.0"; // as the engine names itself (backend/src/ingest/pib.ts)
const log = (s: string) => console.log(s);

function required(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`${name} is not set (a repository secret)`); process.exit(1); }
  return v;
}

/** When this run was due: the workflow runs at minute 7 of every hour (UTC). */
function scheduledFor(now: Date): Date | null {
  if (process.env.CK_EVENT !== "schedule") return null;
  const due = new Date(now);
  due.setUTCSeconds(0, 0);
  due.setUTCMinutes(7);
  if (due > now) due.setUTCHours(due.getUTCHours() - 1);
  return due;
}

/** One page from a source, politely: what it answered, how fast, and how many items it listed. */
async function probe(name: string, url: string, items: RegExp) {
  const t = Date.now();
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
    const html = await res.text();
    return { name, url, status: res.status, ms: Date.now() - t, bytes: html.length, items: (html.match(items) ?? []).length };
  } catch (e) {
    return { name, url, status: 0, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
}

async function probes() {
  const out = [];
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const [y, m, d] = [ist.getUTCFullYear(), String(ist.getUTCMonth() + 1).padStart(2, "0"), String(ist.getUTCDate()).padStart(2, "0")];
  const pibList = await probe("PIB Gujarati list", "https://www.pib.gov.in/allRel.aspx?reg=22&lang=13", /PRID=\d+/g);
  out.push(pibList);
  await new Promise((r) => setTimeout(r, 1500));
  // one release page, as the engine reads them (the newest on the list, else a known one)
  let prid = "2326794";
  if (pibList.status === 200) {
    const res = await fetch("https://www.pib.gov.in/allRel.aspx?reg=22&lang=13", { headers: { "user-agent": UA } }).catch(() => null);
    const found = res && (await res.text()).match(/PRID=(\d+)/);
    if (found) prid = found[1];
    await new Promise((r) => setTimeout(r, 1500));
  }
  out.push(await probe("PIB release page", `https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=${prid}`, /<p[\s>]/g));
  await new Promise((r) => setTimeout(r, 1500));
  out.push(await probe("Gujarat CM's office", "https://cmogujarat.gov.in/gu/news", /\/gu\/news\//g));
  await new Promise((r) => setTimeout(r, 1500));
  out.push(await probe("All India Radio Gujarati", `https://newsonair.gov.in/gu/${y}/${m}/${d}/`, /<article|<h2/g));
  for (const p of out) log(`  ${p.name}: ${p.status || "no answer"}${"items" in p ? `, ${p.items} items` : ""}, ${p.ms} ms${"error" in p ? ` (${p.error})` : ""}`);
  return out;
}

const SYSTEM = `You are a sub-editor at Capital Kranti, a Gujarati daily newspaper from Gandhinagar, Gujarat.
You get one news story in Gujarati. Reply with JSON only, no other text:
{"tier": "gujarat" | "india" | "world",
 "genres": [up to 2 of "farm", "economy", "tech", "health", "sport", "education", "entertainment"],
 "en": {"kicker": "...", "headline": "...", "deck": "...", "body": "...", "caption": "..."}}
tier: "gujarat" if the story is mainly about Gujarat or happens in Gujarat; "world" if it is mainly about other countries or India's relations with them; else "india".
genres: only those that clearly fit; [] if none.
en: a faithful English translation in the style of a careful Indian English newspaper. Keep every fact, name and number exactly; write numbers in figures as the Gujarati does (₹8,941 crore, 2.5 lakh); keep paragraphs separated by a blank line; translate an empty field as "". Add nothing, leave nothing out.`;

interface Tagged { tier: Tier; genres: Genre[]; en: English }

function parse(text: string): Tagged | null {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const v = JSON.parse(json) as Partial<Tagged>;
    const en = v.en as Partial<English> | undefined;
    if (!v.tier || !TIERS.includes(v.tier) || !en?.headline || typeof en.body !== "string") return null;
    return {
      tier: v.tier,
      genres: (Array.isArray(v.genres) ? v.genres : []).filter((g): g is Genre => GENRES.includes(g as Genre)).slice(0, 2),
      en: { kicker: en.kicker ?? "", headline: en.headline, deck: en.deck ?? "", body: en.body, caption: en.caption ?? "" },
    };
  } catch {
    return null;
  }
}

/** One story through the free models, in the profile's order; a second try names the numbers that went wrong. */
async function tagAndTranslate(gu: { kicker: string; headline: string; deck: string; body: string; caption: string }, date: string) {
  const source = [gu.kicker, gu.headline, gu.deck, gu.body, gu.caption].join("\n\n");
  let note = "";
  for (const model of profile.website.freeModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if ((await count(sql, "ai_free")) > profile.website.dailyFreeRequests) return { stop: "the day's free AI requests are used up" } as const;
      const res = await openRouter({
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json",
                   "http-referer": profile.website.url, "x-title": "Capital Kranti website" },
        body: JSON.stringify({
          model, temperature: 0.2, response_format: { type: "json_object" },
          messages: [{ role: "system", content: SYSTEM },
                     { role: "user", content: JSON.stringify({ kicker: gu.kicker, headline: gu.headline, deck: gu.deck, body: gu.body, caption: gu.caption }) + note }],
        }),
      }, 120);
      // the free models allow 20 requests a minute
      await new Promise((r) => setTimeout(r, 3500));
      if (!res.ok) { log(`    ${model}: ${res.status} ${(await res.text()).slice(0, 120)}`); break; }
      const text = ((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
      const got = parse(text);
      if (!got) { log(`    ${model}: an answer that isn't the JSON asked for`); continue; }
      const en = [got.en.kicker, got.en.headline, got.en.deck, got.en.body, got.en.caption].join("\n\n");
      const wrong = numbersNotIn(en, source, date);
      if (!wrong.length) return { ok: got, model } as const;
      log(`    ${model}: numbers not in the Gujarati: ${wrong.join(", ")}`);
      note = `\n\nYour last translation had numbers that are not in the Gujarati: ${wrong.join(", ")}. Translate again and keep every number exactly as the Gujarati has it.`;
      if (attempt === 1) return { tagsOnly: got, model } as const;
    }
  }
  return { failed: true } as const;
}

async function stories() {
  if (!KEY) { log("no OPENROUTER_API_KEY: stories wait for their tags and English"); return { done: 0, failed: 0 }; }
  const rows = await sql.query(
    `select id, issue_date::text as date, kicker, headline, deck, body, caption from stories
      where en_status = 'pending' or tag_status = 'pending' order by issue_date desc, page asc nulls last, rank asc nulls last limit 60`);
  let done = 0, failed = 0;
  for (const r of rows) {
    log(`  ${r.id}: ${String(r.headline).slice(0, 60)}`);
    const out = await tagAndTranslate(r as never, r.date as string);
    if ("stop" in out) { log(`  ${out.stop}: the rest wait for tomorrow`); break; }
    if ("ok" in out) {
      await sql.query(`update stories set tier = $2, genres = $3, tag_status = 'done', en = $4, en_status = 'done' where id = $1`,
        [r.id, out.ok.tier, out.ok.genres, JSON.stringify(out.ok.en)]);
      done++;
    } else if ("tagsOnly" in out) {
      // the sections are sound; the English isn't, so the story stays Gujarati in English (with a note)
      await sql.query(`update stories set tier = $2, genres = $3, tag_status = 'done', en_status = 'failed' where id = $1`,
        [r.id, out.tagsOnly.tier, out.tagsOnly.genres]);
      failed++;
    } else {
      failed++;
    }
  }
  return { done, failed, waiting: rows.length - done - failed };
}

const started = new Date();
await ensureSchema(sql);
const due = scheduledFor(started);
const [run] = await sql.query(`insert into runs (kind, scheduled_for, started_at) values ('hourly', $1, $2) returning id`,
  [due?.toISOString() ?? null, started.toISOString()]);
log(`hourly run ${run.id}${due ? `: due ${due.toISOString()}, started ${Math.round((started.getTime() - due.getTime()) / 60000)} min late` : " (started by hand)"}`);
const details: Record<string, unknown> = {};
let ok = true;
try {
  log("sources:");
  details.sources = await probes();
  log("stories:");
  details.stories = await stories();
} catch (e) {
  ok = false;
  details.error = e instanceof Error ? e.message : String(e);
  log(`failed: ${details.error}`);
}
await sql.query(`update runs set finished_at = now(), ok = $2, details = $3 where id = $1`, [run.id, ok, JSON.stringify(details)]);
if (!ok) process.exit(1);
