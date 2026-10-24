// Command line for the backend.
//
//   node --experimental-strip-types --experimental-sqlite --no-warnings backend/src/cli.ts <command> [--date YYYY-MM-DD]
//
//   ingest   fetch the day's Gujarat Information Department releases
//   pib      fetch the day's PIB releases (--lang gu, the default, or hi)
//   rewrite  turn them into newspaper stories (OpenRouter), or use them as-is
//   topup    translate PIB Hindi releases until the copy fills the paper (--force: even if it does)
//   features add --count N evergreen feature articles (AI, no news, no
//            numbers, kicked "વિશેષ લેખ") to a day short of copy
//   build    plan and lay out the day's issue, check it, save it as a draft, print the PDF
//   all      the whole day: PIB, rewrite, Hindi top-up, features if short, build (what 8 PM runs; --from STEP)
//   publish  copy the built issue into web/public/issues for a website with
//            no backend (--push commits and pushes it; --force if NOT READY;
//            --keep N days on the site, 14 by default)
//   serve    run the API for the website (and the 8 PM job)
//   copies-in --spec FILE   lay out copies in this paper's language (started by
//            editorial/copies.ts for a Hindi or Urdu copy; CK_SOURCE_DB is the day's paper)
//   status   every day in the database: releases, stories, built issues
import { ingestDay } from "./ingest/gujaratInfo.ts";
import { Store } from "./store.ts";

export function today(): string {
  // the paper's day is India's day
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const date = flag("date") ?? today();
const log = (s: string) => console.log(s);

async function main() {
  const store = new Store();
  switch (command) {
    case "ingest": {
      const r = await ingestDay(store, date, { log });
      log(`ingest ${date}: ${r.fetched} new, ${r.skipped} already stored, ${r.releases.length} in total`);
      break;
    }
    case "pib": {
      const { ingestPib } = await import("./ingest/pib.ts");
      const lang = (flag("lang") ?? "gu") as "gu" | "hi";
      const r = await ingestPib(store, date, lang, { log });
      log(`pib ${lang} ${date}: ${r.listed} listed, ${r.fetched} new, ${r.skipped} already stored`);
      break;
    }
    case "rewrite": {
      const { rewriteDay } = await import("./editorial/rewrite.ts");
      await rewriteDay(store, date, { log, model: flag("model"), force: args.includes("--force") });
      break;
    }
    case "topup": {
      const { topUp } = await import("./editorial/translate.ts");
      await topUp(store, date, { log, force: args.includes("--force") });
      break;
    }
    case "features": {
      const { writeFeatures } = await import("./editorial/features.ts");
      await writeFeatures(store, date, Number(flag("count") ?? 3), { log, model: flag("model") });
      break;
    }
    case "build": {
      const { buildIssue } = await import("./build.ts");
      await buildIssue(store, date, { log, issueNumber: flag("issue") ? Number(flag("issue")) : undefined });
      break;
    }
    case "all": {
      const { runPipeline } = await import("./pipeline.ts");
      // (--evening: as the 8 PM run, which starts the sister papers' wording beside the layout)
      await runPipeline(store, date, { by: args.includes("--evening") ? "schedule" : "cli", from: flag("from") as never, log });
      break;
    }
    case "publish": {
      const { publishIssue } = await import("./publish.ts");
      await publishIssue(store, date, { log, force: args.includes("--force"), push: args.includes("--push"),
                                       keep: flag("keep") ? Number(flag("keep")) : undefined });
      break;
    }
    case "status": {
      // every day that has anything: what's there, and the latest build
      const count = (table: string) => new Map((store.db.prepare(`select date, count(*) n from ${table} group by date`).all() as
        { date: string; n: number }[]).map((r) => [r.date, r.n]));
      const releases = count("releases"), stories = count("stories");
      const days = [...new Set([...releases.keys(), ...stories.keys(),
        ...(store.db.prepare("select distinct date from issues").all() as { date: string }[]).map((r) => r.date)])].sort();
      log("date        releases stories  latest issue");
      for (const d of days) {
        const got = store.latestIssue(d);
        const ready = (got?.report as { ready?: boolean } | undefined)?.ready;
        log(`${d}  ${String(releases.get(d) ?? 0).padStart(8)} ${String(stories.get(d) ?? 0).padStart(7)}  ` +
            (got ? `v${got.version} ${got.status}${ready === undefined ? "" : ready ? ", READY" : ", NOT READY"}` : "-"));
      }
      break;
    }
    case "editions": {
      // the day's sister papers, as the evening makes them (timed, for the log)
      const { makeEditions, DEFAULT_EDITIONS } = await import("./editorial/copies.ts");
      const t = Date.now();
      await makeEditions(store, date, store.setting("editions", DEFAULT_EDITIONS), { log });
      log(`editions ${date}: ${((Date.now() - t) / 60_000).toFixed(1)} min`);
      break;
    }
    case "copies": {
      // the day's copies, as the newsroom makes them (timed, with their cost)
      const { makeCopies } = await import("./editorial/copies.ts");
      const t = Date.now();
      const b = await makeCopies(store, date, { count: Number(flag("count") ?? 3), reword: (flag("reword") ?? "all") as never,
                                                shuffle: (flag("shuffle") ?? "keepLead") as never, lang: flag("lang") as never, log });
      log(`copies ${date}: ${((Date.now() - t) / 60_000).toFixed(1)} min, $${b.cost.toFixed(4)}`);
      break;
    }
    case "copies-in": {
      const { copiesIn } = await import("./editorial/copies.ts");
      await copiesIn(store, flag("spec") ?? "");
      break;
    }
    case "serve": {
      const { serve } = await import("./server.ts");
      await serve(store, { port: Number(flag("port") ?? process.env.PORT ?? 4000), host: process.env.HOST?.trim() || undefined, log });
      return;
    }
    default:
      log("usage: cli.ts ingest|pib|rewrite|topup|features|build|all|publish|serve|status [--date YYYY-MM-DD]");
      process.exitCode = 2;
  }
}

await main();
