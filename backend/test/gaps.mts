// Prints the empty stretches the last build of a day left (the gate 2 list).
//   DATA_DIR=... node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/gaps.mts <date>
import { Store } from "../src/store.ts";
const got = new Store().latestIssue(process.argv[2]);
const report = got?.report as { whiteSpace: { page: number; col: number; height: number; y?: number }[] } | undefined;
for (const g of report?.whiteSpace ?? []) console.log(`page ${g.page} column ${g.col}: ${g.height}pt${g.y !== undefined ? ` from ${g.y}pt` : ""}`);
