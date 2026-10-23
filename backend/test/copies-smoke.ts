// Two copies of a built day with the tests' stand-in AI (CK_FAKE_AI=1):
// each must come out as its own PDF, placed unlike the day's paper and each other.
//   CK_FAKE_AI=1 DATA_DIR=<copy of the data> node ... backend/test/copies-smoke.ts 2026-10-22
import { existsSync } from "node:fs";
import { makeCopies, copyFile } from "../src/editorial/copies.ts";
import { Store } from "../src/store.ts";

const date = process.argv[2] ?? "2026-10-22";
const store = new Store();
const run = await makeCopies(store, date, { count: Number(process.argv[3] ?? 2), reword: (process.argv[4] ?? "headline") as "headline", shuffle: (process.argv[5] ?? "keepLead") as "keepLead", log: (l) => console.log(l) });
console.log(JSON.stringify({ status: run.status, error: run.error, files: run.files, cost: run.cost }));
for (const f of run.files) if (!existsSync(copyFile(date, f.n))) throw new Error(`copy ${f.n} has no PDF`);
if (run.status !== "done") process.exit(1);
