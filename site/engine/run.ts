// The engine's run, every 15 minutes on GitHub (.github/workflows/site-engine.yml;
// ROADMAP §3, decided 25 Oct). In order, each step stopping in time for the next run:
//   0. messages to the Telegram bot since the last run (lib/telegram.ts);
//   1. every source asked what's new (collect.ts);
//   2. new items ranked and grouped into events (triage.ts);
//   3. each event's checks: fresh, not debunked, official or 2+ independent outlets (newsroom.ts gate);
//   4. the most important confirmed events written in Gujarati, checked claim by claim
//      by a second free model, English and Hindi added for national and world news;
//   5. live at once, with no one to approve it (the user, 30 Oct); a story that doesn't pass its checks doesn't go up;
//      no official photo: a free file photo of its subject from Wikimedia Commons (wikiphoto.ts);
//   8. the last day and a half's stories still without a photo: the same, once each;
//   9. published stories watched for 24 hours: a source correcting or withdrawing takes them down.
// Free models only: the day's allowance is spent on the most important events first.
// Run: node --experimental-strip-types site/engine/run.ts   (DATABASE_URL, OPENROUTER_API_KEY;
//      BLOB_READ_WRITE_TOKEN for photos; TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS for notes to the editor)
import { neon } from "@neondatabase/serverless";
import { WEBSITE } from "../lib/config.ts";
import { ensureSchema } from "../lib/schema.ts";
import { pollUpdates, tell } from "../lib/telegram.ts";
import { touched } from "../lib/write.ts";
import { aiLeft, aiUsed, freeModels } from "./ai.ts";
import { collect } from "./collect.ts";
import { gate, gather, importance, levelOf, needsTranslation, translate, writeChecked, type ClusterItem, type Debunk } from "./newsroom.ts";
import { indiaDate, photoOf, saveLive } from "./publish.ts";
import { alertBreaking } from "../lib/push.ts";
import { birthdays, leaders } from "../lib/leaders.ts";
import { freePhoto } from "./wikiphoto.ts";
import { cluster, placeTier, sameEvent, triage, type Triage } from "./triage.ts";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set (a repository secret)"); process.exit(1); }
const sql = neon(url);
const started = Date.now();
/** the round's log, kept with the round (India's time) so the status page shows what a slow round was doing */
const lines: string[] = [];
const log = (s: string) => {
  console.log(s);
  lines.push(`${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} ${s}`.slice(0, 300));
  if (lines.length > 80) lines.shift();
};
/** no new work after this, so the round ends before the next starts (29 Oct: a story begun at 11 minutes ran past the
 *  13-minute limit and a third of the rounds were cut off unfinished) */
const deadline = started + 8 * 60_000;
/** free requests kept back each day for the hourly run's English (site/pipeline/run.ts) */
const RESERVE = 120;
/** at most this many stories written in one run (each takes ~3-5 requests) */
const PER_RUN = 8;

const CORRECTION = /\b(corrigendum|correction|corrected|withdrawn|retracted|clarification|erratum)\b|સુધારો|સ્પષ્ટતા|शुद्धिपत्र|संशोधन|स्पष्टीकरण/i;

async function itemsOf(clusterId: string): Promise<ClusterItem[]> {
  const rows = await sql.query(
    `select id, source, url, title, summary, lang, published_at, seen_at, image, triage from items where cluster_id = $1 order by seen_at`, [clusterId]);
  return rows.map((r) => ({ id: r.id, source: r.source, url: r.url, title: r.title, summary: r.summary, lang: r.lang,
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null, seenAt: new Date(r.seen_at).toISOString(),
    image: r.image, triage: r.triage as Triage }));
}

async function debunks(): Promise<Debunk[]> {
  const rows = await sql.query(
    `select source, url, triage from items where cluster_id = 'factcheck' and seen_at > now() - interval '30 days' and coalesce(triage->>'debunk', '') <> ''`);
  return rows.map((r) => ({ claim: (r.triage as Triage).debunk!, keys: (r.triage as Triage).keys, url: r.url, source: r.source }));
}

/** Step 3: every open event through the checks before writing. */
async function advance() {
  const open = await sql.query(`select id, first_seen from clusters where state in ('new', 'waiting') and updated_at > now() - interval '48 hours'`);
  const known = await debunks();
  const tally: Record<string, number> = {};
  for (const c of open) {
    const g = gate(await itemsOf(c.id), new Date(c.first_seen).toISOString(), known);
    tally[g.state] = (tally[g.state] ?? 0) + 1;
    await sql.query(`update clusters set state = $2, reason = $3 where id = $1`, [c.id, g.state, g.why]);
    if (g.state === "blocked") await tell(`🚫 <b>ફેક્ટ-ચેક:</b> ${g.why}`);
  }
  log(`  checks: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing open"}`);
}

/** stories written this round, across its two writing passes */
let wrote = 0;
/** Steps 4 and 5: the most important confirmed events, written, checked, translated, saved; no story is begun
 *  after `until` (the first pass stops at three minutes, so the new items are still sorted that round). */
async function write(until = deadline) {
  const left = await aiLeft(sql);
  const can = Math.min(PER_RUN, Math.floor((left - RESERVE) / 5));
  if (can <= 0) { log(`  writing: waits (${left} free requests left today)`); return; }
  const ready = await sql.query(`select * from clusters where state = 'confirmed' order by write_tries, score desc, first_seen asc limit 40`);
  for (const c of ready) {
    if (wrote >= can || Date.now() > until) break;
    const items = await itemsOf(c.id);
    const g = gate(items, new Date(c.first_seen).toISOString(), []);
    if (g.state !== "confirmed") continue;
    const imp = importance(Math.max(...items.map((i) => i.triage.score)), c.tier, g.groups.length, g.official);
    const level = levelOf(imp);
    if (!level) { await sql.query(`update clusters set state = 'dropped', reason = 'too small for a story' where id = $1`, [c.id]); continue; }
    const twin = await sameEvent(sql, { id: c.id, event: c.event, keys: c.keys ?? [] });
    if (twin) {
      // its reports join the story already up (the watch step reads them for changes) instead of a second story
      await sql.query(`update items set cluster_id = $2 where cluster_id = $1`, [c.id, twin.id]);
      await sql.query(`update clusters set state = 'dropped', reason = $2 where id = $1`, [c.id, `same event as ${twin.story}`]);
      log(`    same event as ${twin.story}: ${c.event}`);
      continue;
    }
    const src = await gather(items);
    if (!src.length) { await sql.query(`update clusters set state = 'dropped', reason = 'no source text to write from' where id = $1`, [c.id]); continue; }
    log(`  writing ${c.id} (${level}, ${imp}): ${c.event}`);
    const res = await writeChecked(sql, src, level, indiaDate(), c.event);
    wrote++;
    // not written, or written and still failing its checks: it doesn't go up, and it's tried again up to three times
    if (!res.ok) {
      log(`    not written${"retry" in res && res.retry ? " (the free models are busy: next run)" : ""}: ${res.why}`);
      if (res.stop || ("retry" in res && res.retry)) break;
      // 29 Oct: a gold-price story the models kept getting wrong took four minutes of every round
      await sql.query(`update clusters set write_tries = write_tries + 1,
         state = case when write_tries >= 2 then 'dropped' else state end,
         reason = case when write_tries >= 2 then 'not written in 3 tries' else reason end where id = $1`, [c.id]);
      continue;
    }
    let w = res.written;
    const checked = res.checked;
    const id = `live-${c.id.slice(1)}`;
    // past the round's time: the story goes up now and its English and Hindi come with a later round (translations())
    const translated = needsTranslation(c.tier) && Date.now() < deadline;
    let en = translated ? await translate(sql, w, "en", indiaDate()) : null;
    let hi = translated ? await translate(sql, w, "hi", indiaDate()) : null;
    let photo = await photoOf(sql, src, id);
    // no official photo: a file photo of the story's subject from Wikimedia Commons (not for sensitive news)
    if (!photo && !c.sensitive) {
      const free = await freePhoto(sql, w, id);
      if (free) {
        photo = free.photo;
        w = { ...w, caption: free.caption.gu };
        if (en) en = { ...en, caption: free.caption.en };
        if (hi) hi = { ...hi, caption: free.caption.hi };
        log(`    file photo: ${free.caption.en} (${free.photo.credit})`);
      }
    }
    await saveLive(sql, { id, tier: c.tier, genres: c.genres, written: w, checked, src, importance: imp, status: "published",
                          holdReason: null, en, hi, translated, photo });
    await sql.query(`update stories set photo_tried = true where id = $1`, [id]);
    await sql.query(`update clusters set state = $2, story_id = $3, reason = $4 where id = $1`, [c.id, "published", id, null]);
    await touched(sql);
    log(`    published: ${w.headline}`);
    // breaking news: an alert to the phones that asked (lib/push.ts)
    await alertBreaking(sql, { id, importance: imp, publishedAt: new Date().toISOString(), headline: { gu: w.headline, en: en?.headline ?? null, hi: hi?.headline ?? null } }, log)
      .catch((e) => log(`    no alert: ${e instanceof Error ? e.message : e}`));
  }
}

/** Step 8: the last day and a half's stories that went up without a photo get a file photo,
 *  the most important first, each looked for once (engine/wikiphoto.ts). */
async function photos() {
  // once: the stories looked for before the lookup read Wikipedia's resized-copy addresses
  // and India's open licence (29 Oct) are looked for again
  const [again] = await sql.query(`select value from state where key = 'photo_retry'`);
  if (!again) {
    await sql.query(`update stories set photo_tried = false where origin = 'live' and photo is null and published_at > now() - interval '36 hours'`);
    await sql.query(`insert into state (key, value) values ('photo_retry', '1') on conflict (key) do nothing`);
  }
  const rows = await sql.query(
    `select id, kicker, headline, deck, body from stories where origin = 'live' and status = 'published' and photo is null and not photo_tried
       and published_at > now() - interval '36 hours' order by importance desc nulls last, published_at desc limit 6`);
  let added = 0;
  for (const r of rows) {
    if (Date.now() > deadline) break;
    const free = await freePhoto(sql, { kicker: r.kicker, headline: r.headline, deck: r.deck, body: r.body, caption: "", model: "" }, r.id);
    await sql.query(
      `update stories set photo_tried = true, photo = coalesce($2::jsonb, photo), caption = coalesce($3, caption),
          en = case when en is not null and $4::text is not null then jsonb_set(en, '{caption}', to_jsonb($4::text)) else en end,
          hi = case when hi is not null and $5::text is not null then jsonb_set(hi, '{caption}', to_jsonb($5::text)) else hi end,
          updated_at = case when $2::jsonb is not null then now() else updated_at end
        where id = $1`,
      [r.id, free ? JSON.stringify(free.photo) : null, free?.caption.gu ?? null, free?.caption.en ?? null, free?.caption.hi ?? null]);
    if (free) { added++; log(`    ${r.id}: file photo, ${free.caption.en} (${free.photo.credit})`); }
  }
  if (added) await touched(sql);
  return added;
}

/** Once (30 Oct, approvals removed): what was waiting for the editor is settled. Stories held only for being sensitive go up
 *  at their own time; anything that failed a check, or that a source corrected, goes to the removed list, where the editor
 *  can put it back. Articles waiting for a real picture stay: they come back by themselves. */
async function settleWaiting() {
  const [done] = await sql.query(`select value from state where key = 'no_approval_once'`);
  if (done) return;
  const up = await sql.query(
    `update stories set status = 'published', hold_reason = null, updated_at = now()
      where status = 'held' and hold_reason = 'સંવેદનશીલ સમાચાર' and jsonb_array_length(coalesce(checks->'problems', '[]')) = 0 returning id`);
  if (up.length) await sql.query(`update clusters set state = 'published', reason = null where story_id = any($1)`, [up.map((r) => r.id)]);
  const off = await sql.query(`update stories set status = 'withdrawn', updated_at = now() where status = 'held' returning id`);
  const arts = await sql.query(
    `update features set status = 'withdrawn', updated_at = now() where status = 'draft' or (status = 'held' and coalesce(checks->>'held_for', '') <> 'picture') returning id`);
  await sql.query(`insert into state (key, value) values ('no_approval_once', '1') on conflict (key) do nothing`);
  log(`waiting stories settled: ${up.length} up, ${off.length} removed; ${arts.length} waiting articles removed`);
  if (up.length) await touched(sql);
}

/** Once (29 Oct): a story that went up twice (Spain's train crash) keeps its first copy; the later one comes down. */
async function dedupe() {
  const [done] = await sql.query(`select value from state where key = 'dedupe_once'`);
  if (done) return 0;
  const rows = await sql.query(
    `select c.id, c.event, c.keys, c.first_seen, c.story_id from clusters c join stories s on s.id = c.story_id
      where s.status = 'published' and s.origin = 'live' and c.first_seen > now() - interval '48 hours' order by c.first_seen desc limit 40`);
  let removed = 0;
  for (const r of rows) {
    if (Date.now() > deadline) return removed;
    const twin = await sameEvent(sql, { id: r.id, event: r.event, keys: r.keys ?? [], before: new Date(r.first_seen).toISOString() });
    if (!twin) continue;
    await sql.query(`update stories set status = 'withdrawn', hold_reason = $2, updated_at = now() where id = $1 and status = 'published'`,
      [r.story_id, `the same event as ${twin.story}`]);
    await sql.query(`update items set cluster_id = $2 where cluster_id = $1`, [r.id, twin.id]);
    await sql.query(`update clusters set state = 'dropped', reason = $2 where id = $1`, [r.id, `same event as ${twin.story}`]);
    removed++;
    log(`    a second copy taken down: ${r.story_id} (the same event as ${twin.story})`);
  }
  await sql.query(`insert into state (key, value) values ('dedupe_once', '1') on conflict (key) do nothing`);
  if (removed) await touched(sql);
  return removed;
}

/** Once (29 Oct): events filed under Gujarat whose sources are about somewhere else (Mumbai's airport)
 *  move to India, with their stories. (The first pass, 'tier_refile', read the model's own keywords.) */
async function refile() {
  const [done] = await sql.query(`select value from state where key = 'tier_refile_2'`);
  if (done) return 0;
  const rows = await sql.query(
    `select c.id, c.event, c.story_id, string_agg(i.title || ' ' || i.summary, ' ') as words
       from clusters c join items i on i.cluster_id = c.id
      where c.tier = 'gujarat' and c.first_seen > now() - interval '7 days' group by c.id, c.event, c.story_id`);
  let moved = 0;
  for (const r of rows) {
    if (placeTier("gujarat", r.words ?? "") === "gujarat") continue;
    await sql.query(`update clusters set tier = 'india' where id = $1`, [r.id]);
    if (r.story_id) await sql.query(`update stories set tier = 'india', updated_at = now() where id = $1 and tier = 'gujarat'`, [r.story_id]);
    moved++;
    log(`    to India: ${r.event}`);
  }
  await sql.query(`insert into state (key, value) values ('tier_refile_2', '1') on conflict (key) do nothing`);
  if (moved) await touched(sql);
  return moved;
}

/** The last three days' stories without their English or Hindi (Gujarat's news went without, before 29 Oct; or a
 *  translation failed) get them, the most important first, a few each run as the free allowance goes; then the
 *  printed paper's stories of the last month without Hindi (29 Oct: 70 of them; their English is the hourly run's,
 *  pipeline/run.ts, which makes no Hindi). */
async function translations() {
  const left = await aiLeft(sql);
  const can = Math.min(6, Math.floor((left - RESERVE) / 2));
  if (can <= 0) return 0;
  const rows = await sql.query(
    `select id, origin, kicker, headline, deck, body, caption, en_status, hi_status from stories
      where status = 'published' and (origin = 'live' and published_at > now() - interval '3 days' and (en_status <> 'done' or hi_status <> 'done')
                                      or origin <> 'live' and published_at > now() - interval '30 days' and hi_status <> 'done')
      order by origin = 'live' desc, importance desc nulls last, published_at desc limit $1`, [can]);
  let done = 0;
  for (const r of rows) {
    if (Date.now() > deadline) break;
    const w = { kicker: r.kicker, headline: r.headline, deck: r.deck, body: r.body, caption: r.caption, model: "" };
    const en = r.en_status === "done" || r.origin !== "live" ? null : await translate(sql, w, "en", indiaDate());
    const hi = r.hi_status === "done" ? null : await translate(sql, w, "hi", indiaDate());
    await sql.query(
      `update stories set en = coalesce($2::jsonb, en), en_status = case when $2::jsonb is not null then 'done' else en_status end,
          hi = coalesce($3::jsonb, hi), hi_status = case when $3::jsonb is not null then 'done' else hi_status end, updated_at = now()
        where id = $1`, [r.id, en ? JSON.stringify(en) : null, hi ? JSON.stringify(hi) : null]);
    if (en || hi) done++;
  }
  if (done) await touched(sql);
  return done;
}

/** The day's birthdays on the leaders list (lib/leaders.ts), told to the editor once, from 6 AM India time: the greeting
 *  picture and the email draft wait on the editor page. Nothing is sent to the leaders. */
async function birthdayNote() {
  if (Number(new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false })) < 6) return;
  const first = await sql.query(`insert into state (key, value) values ($1, now()::text) on conflict (key) do nothing returning key`, [`birthdays:${indiaDate()}`]);
  if (!first.length) return;
  const { today } = birthdays(await leaders(sql));
  if (!today.length) return;
  log(`birthdays today: ${today.map((l) => l.nameEn || l.nameGu).join(", ")}`);
  await tell(`🎂 <b>આજે જન્મદિવસ:</b> ${today.map((l) => `${l.title} ${l.nameGu}`).join(", ")}\nશુભેચ્છા ફોટો અને ઈમેલનો મુસદ્દો સંપાદકના પાના પર તૈયાર છે: ${WEBSITE.url}/editor#leaders`);
}

/** Step 9: a published story's sources watched for 24 hours. */
async function watch() {
  const live = await sql.query(
    `select c.id, c.story_id, s.sources, s.updated_at, s.status from clusters c join stories s on s.id = c.story_id
      where c.state in ('published', 'held') and s.published_at > now() - interval '24 hours'`);
  for (const c of live) {
    const fresh = await sql.query(`select source, url, title, summary from items where cluster_id = $1 and seen_at > $2`, [c.id, c.updated_at]);
    if (!fresh.length) continue;
    const have = new Set((c.sources as { url: string }[]).map((s) => s.url));
    const add = fresh.filter((f) => !have.has(f.url));
    const corrected = fresh.find((f) => CORRECTION.test(`${f.title} ${f.summary}`));
    if (corrected && c.status === "published") {
      await sql.query(`update stories set status = 'withdrawn', hold_reason = $2, updated_at = now() where id = $1`,
        [c.story_id, `a source corrected or withdrew it: ${corrected.title}`]);
      await touched(sql);
      await tell(`⚠️ <b>સમાચાર રોક્યા:</b> સ્રોતે સુધારો કર્યો કે પાછા ખેંચ્યા.\n${corrected.title}\n${corrected.url}`);
      log(`    ${c.story_id}: taken down, a source corrected it`);
    } else if (add.length) {
      const { sourceById } = await import("./sources.ts");
      const more = add.map((f) => ({ name: sourceById.get(f.source)?.name ?? f.source, url: f.url, trust: sourceById.get(f.source)?.trust, group: sourceById.get(f.source)?.group }));
      await sql.query(`update stories set sources = sources || $2::jsonb, updated_at = now() where id = $1`, [c.story_id, JSON.stringify(more)]);
    }
  }
}

await ensureSchema(sql);
// the editor's stop switch (the editor page, lib/editor.ts): nothing collected, written or published
const [paused] = await sql.query(`select value from state where key = 'engine_paused'`);
if (paused?.value === "yes") { log("the editor has paused the engine: nothing to do"); process.exit(0); }
const [run] = await sql.query(`insert into runs (kind, started_at) values ('engine', now()) returning id`);
const details: Record<string, unknown> = { models: await freeModels() };
let ok = true;
// each step's start kept as it goes, and the round ended by itself at 12 minutes, so a slow step is named and the round still
// finishes (29 Oct: rounds cut off by the keeper's 14-minute limit left nothing saved to say why)
const steps: Record<string, number> = {};
const step = (name: string) => {
  steps[name] = Math.round((Date.now() - started) / 1000);
  return sql.query(`update runs set details = $2 where id = $1`, [run.id, JSON.stringify({ ...details, steps, log: lines })]).catch(() => null);
};
const guard = setTimeout(async () => {
  const at = Object.keys(steps).at(-1) ?? "start";
  await sql.query(`update runs set finished_at = now(), ok = false, details = $2 where id = $1`,
    [run.id, JSON.stringify({ ...details, steps, log: lines, error: `stopped after 12 minutes, still at "${at}"` })]).catch(() => null);
  await fetch(`${WEBSITE.url}/api/refresh`, { method: "POST", signal: AbortSignal.timeout(30_000) }).catch(() => null);
  log(`stopped after 12 minutes, still at "${at}"`);
  process.exit(1);
}, 12 * 60_000);
try {
  log(`engine run ${run.id}; free models: ${(details.models as string[]).join(", ")}`);
  await settleWaiting();
  await step("presses");
  details.presses = await pollUpdates(sql);
  log("sources:");
  await step("sources");
  details.collect = await collect(sql, log, started + 4 * 60_000);
  // the stories confirmed in earlier rounds written first, then the new items sorted (29 Oct: sorting slowed by the
  // Gemmas shared with Aavtikal's desk took six minutes, writing began after the round's time and no story went up
  // for hours); no story is begun after three minutes, the sorting has two minutes at least (in run 144 the writing
  // took seven and sorted nothing), and what it confirms is written after the checks if time is left
  log("writing:");
  await step("writing");
  await write(started + 3 * 60_000);
  log("triage:");
  await step("triage");
  const left = await aiLeft(sql);
  details.triage = await triage(sql, log, Math.max(0, Math.min(6, Math.floor((left - RESERVE) / 10))), Math.min(deadline - 60_000, Math.max(started + 5 * 60_000, Date.now() + 2 * 60_000)));
  await cluster(sql, log);
  log("checks:");
  await step("checks");
  await advance();
  log("writing what was confirmed:");
  await step("writing again");
  await write();
  log("photos:");
  await step("refiling");
  details.refiled = await refile();
  await step("duplicates");
  details.deduped = await dedupe();
  await step("photos");
  details.photos = await photos();
  await step("translations");
  details.translated = await translations();
  await step("watch");
  await watch();
  await step("birthdays");
  await birthdayNote();
} catch (e) {
  ok = false;
  details.error = e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 4).join("\n")}` : String(e);
  log(`failed: ${details.error}`);
}
clearTimeout(guard);
details.steps = steps;
details.log = lines;
details.aiRequests = aiUsed();
details.seconds = Math.round((Date.now() - started) / 1000);
await sql.query(`update runs set finished_at = now(), ok = $2, details = $3 where id = $1`, [run.id, ok, JSON.stringify(details)]);
const refreshed = await fetch(`${WEBSITE.url}/api/refresh`, { method: "POST", signal: AbortSignal.timeout(30_000) }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
log(`website refresh: ${JSON.stringify(refreshed)}; ${aiUsed()} free AI request(s), ${details.seconds}s`);
if (!ok) process.exit(1);
