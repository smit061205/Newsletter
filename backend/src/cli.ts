// Command line for the backend.
//
//   node --experimental-strip-types --experimental-sqlite --no-warnings backend/src/cli.ts <command> [--date YYYY-MM-DD]
//
//   ingest   fetch the day's Gujarat Information Department releases
//   rewrite  turn them into newspaper stories (OpenRouter), or use them as-is
//   build    plan and lay out the day's issue, check it, save it as a draft, print the PDF
//   all      ingest + rewrite + build (what the 8 PM job runs)
//   serve    run the API for the website (and the 8 PM job)
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
    case "rewrite": {
      const { rewriteDay } = await import("./editorial/rewrite.ts");
      await rewriteDay(store, date, { log, model: flag("model"), force: args.includes("--force") });
      break;
    }
    case "build": {
      const { buildIssue } = await import("./build.ts");
      await buildIssue(store, date, { log, issueNumber: flag("issue") ? Number(flag("issue")) : undefined });
      break;
    }
    case "all": {
      const { runDay } = await import("./build.ts");
      await runDay(store, date, { log });
      break;
    }
    case "serve": {
      const { serve } = await import("./server.ts");
      await serve(store, { port: Number(flag("port") ?? 4000), log });
      return;
    }
    default:
      log("usage: cli.ts ingest|rewrite|build|all|serve [--date YYYY-MM-DD]");
      process.exitCode = 2;
  }
}

await main();
