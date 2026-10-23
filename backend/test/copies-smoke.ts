// Copies of a built day with the tests' stand-in AI (CK_FAKE_AI=1): each must
// come out as its own PDF. A Hindi set runs through the Hindi paper's process.
//   CK_FAKE_AI=1 DATA_DIR=<copy of the data> node ... backend/test/copies-smoke.ts DATE COUNT REWORD SHUFFLE [LANG]
import { existsSync } from "node:fs";
import { copyFile, makeCopies } from "../src/editorial/copies.ts";
import { Store } from "../src/store.ts";

const [date = "2026-10-22", count = "2", reword = "headline", shuffle = "keepLead", lang] = process.argv.slice(2);
const store = new Store();
const run = await makeCopies(store, date, { count: Number(count), reword: reword as "headline", shuffle: shuffle as "keepLead",
                                            lang: lang as "gu" | undefined, log: (l) => console.log(l) });
console.log(JSON.stringify({ status: run.status, error: run.error, files: run.files, cost: run.cost }));
for (const f of run.files) if (!existsSync(copyFile(date, f.n))) throw new Error(`copy ${f.n} has no PDF`);
if (run.status !== "done" || run.files.length !== Number(count)) process.exit(1);
