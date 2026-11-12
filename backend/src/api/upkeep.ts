// What the engine does by itself while it runs: the evening's paper at the run
// time, a backup of the database every day (and old files cleared), and the
// day's news collected every hour.
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, ROOT } from "../config.ts";
import { collecting, currentJob, stopJob } from "../pipeline.ts";
import { profile } from "../profile.ts";
import type { Store } from "../store.ts";
import { indiaNow } from "./http.ts";
import { copiesNow } from "./runs.ts";
import { envHas, settingsOf } from "./settings.ts";


/** Calls `job` once a day at the settings' run time (India time), if it's on. */
export function everyEvening(store: Store, job: (day: string) => Promise<unknown>, log: (s: string) => void) {
  // a run missed while the computer was off happens when it's back -- but not
  // on the very first start (a fresh install after the run time waits for tomorrow)
  if (!store.setting("firstStart", "")) {
    const { day, time } = indiaNow();
    store.putSetting("firstStart", day);
    if (time >= settingsOf(store).runAt) store.putSetting("lastScheduledRun", day);
  }
  setInterval(() => {
    const { autoRun, runAt } = settingsOf(store);
    const { day, time } = indiaNow();
    if (!autoRun || time < runAt || store.setting("lastScheduledRun", "") === day) return;
    // no AI key: nothing would be written or translated -- wait for one (Settings)
    if (!envHas("OPENROUTER_API_KEY")) {
      if (store.setting("noKeyLogged", "") !== day) { store.putSetting("noKeyLogged", day); log(`evening run for ${day} skipped: no OpenRouter key yet (Settings)`); }
      return;
    }
    // an earlier day's run still going (9 Nov's waited for PIB all night): stopped, so tonight's
    // paper is made -- the next look, in half a minute, starts it. The day's own, started by hand, stands
    const going = currentJob();
    if (going && going.date !== day) {
      if (stopJob()) log(`the run for ${going.date} is still going at ${runAt}: stopped, so ${day}'s paper is made`);
      return;
    }
    store.putSetting("lastScheduledRun", day);
    if (going) return log(`evening run for ${day}: already being made`);
    log(`evening run for ${day}`);
    job(day).catch((e) => log(`evening run failed: ${e instanceof Error ? e.message : e}`));
  }, 30_000);
}

/** A copy of the database every day (backups/, the last 7 kept: 30 more are outside, backup.ts): SQLite's
 * VACUUM INTO, consistent even while the engine writes. */
export function backupDaily(store: Store, log: (s: string) => void) {
  const dir = path.join(DATA_DIR || ROOT, "backups");
  const once = async () => {
    const file = path.join(dir, `capital-kranti-${indiaNow().day}.sqlite`);
    if (existsSync(file)) return;
    await mkdir(dir, { recursive: true });
    store.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const { readdir, rm } = await import("node:fs/promises");
    const old = (await readdir(dir)).filter((f) => /^capital-kranti-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().slice(0, -7);
    for (const f of old) await rm(path.join(dir, f));
    log(`database backed up to ${file}`);
  };
  // and a copy outside the app's folder (Settings' backup folder, backup.ts)
  const outside = async () => (await import("../backup.ts")).backUp(store, indiaNow().day, { log });
  // then, once a day, old files cleared (tidy.ts)
  const tidyOnce = async () => {
    const day = indiaNow().day;
    if (store.setting<{ day?: string }>("tidied", {}).day === day) return;
    await (await import("../tidy.ts")).tidy(store, day, { busy: !!(currentJob() || copiesNow?.()), log });
  };
  const safe = () => once().catch((e) => log(`backup failed: ${e instanceof Error ? e.message : e}`))
    .then(() => outside().catch(() => {})).then(() => tidyOnce().catch((e) => log(`clearing old files failed: ${e instanceof Error ? e.message : e}`)));
  safe();
  setInterval(safe, 60 * 60_000);
}

/** The day's work done as the news comes in, every hour while the engine
 * runs, so the evening run is left with little but the layout:
 *   - PIB's own releases, and (a Gujarati paper) the CM's office and All India
 *     Radio side by side; PIB's Hindi and English releases read too, ready to
 *     translate; the day's lists saved (PIB shows programs only today's list,
 *     its date form refused, 24 Oct 2026: a day made later is made from these);
 *   - the stories written as their releases arrive (the evening keeps them:
 *     no paying twice);
 *   - from 5 PM, a day still short of copy translated up to the pages' need.
 * Quiet: a site not answering waits for the next hour. Never while a run goes
 * (and a run that starts meanwhile waits for it: pipeline.ts collecting). */
export function collectHourly(store: Store, log: (s: string) => void) {
  const once = async () => {
    if (collecting.current || currentJob()) return;
    const work = (async () => {
      const { ingestPib, withPatience, FEEDS } = await import("../ingest/pib.ts");
      const feed = (profile.language.lang in FEEDS ? profile.language.lang : "en") as keyof typeof FEEDS;
      const { day, time } = indiaNow();
      const gu = feed === "gu";
      const pib = withPatience({ tries: 1, seconds: 30 }, async () => {
        const r = await ingestPib(store, day, feed);
        if (r.fetched) log(`collected ${r.fetched} new PIB release(s) for ${day}`);
        // the releases a Gujarati paper's top-up translates from, read ahead
        if (gu) await (await import("../editorial/translate.ts")).readForeign(store, day);
      }).catch((e: unknown) => log(`PIB collection skipped this hour: ${e instanceof Error ? e.message : e}`));
      const others = gu ? (async () => {
        const { ingestOfficial } = await import("../ingest/official.ts");
        const o = await ingestOfficial(store, day);
        if (o.fetched) log(`collected ${o.fetched} new item(s) from the CM's office and All India Radio for ${day}`);
      })().catch((e: unknown) => log(`the CM's office and All India Radio skipped this hour: ${e instanceof Error ? e.message : e}`)) : null;
      await Promise.all([pib, others]);
      if (gu) (await import("../ingest/official.ts")).dropTwinsOfPib(store, day);
      // written ahead (an AI key needed): the evening keeps what's written
      if (!envHas("OPENROUTER_API_KEY")) return;
      const quiet = () => {};
      const { rewriteDay } = await import("../editorial/rewrite.ts");
      await rewriteDay(store, day, { log: quiet });
      if (gu && time >= "17:00") {
        const { topUp } = await import("../editorial/translate.ts");
        await topUp(store, day, { log: quiet });
      }
    })();
    collecting.current = work.catch((e: unknown) => log(`the hourly collection stopped: ${e instanceof Error ? e.message : e}`))
      .finally(() => { collecting.current = null; });
  };
  setTimeout(once, 60_000);
  setInterval(once, 60 * 60_000);
}
