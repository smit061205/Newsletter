// Encodes every 8 August legacy span (from its decoded Unicode) and today's
// stories with the Bharati encoder, for scripts/replica/bharati_check.py to
// decode back and compare.
//   node --experimental-strip-types --no-warnings backend/test/bharati-roundtrip.ts spans.json today.json out.json
import { readFileSync, writeFileSync } from "node:fs";
import { BharatiEncoder } from "../src/fonts/bharati.ts";

const [spansFile, todayFile, outFile] = process.argv.slice(2);
const enc = new BharatiEncoder();
const spans: [string, string][] = JSON.parse(readFileSync(spansFile, "utf8"));
const today: string = JSON.parse(readFileSync(todayFile, "utf8"));
const words = [...new Set(today.split(/\s+/).filter((w) => /[઀-૿]/.test(w) && !/[A-Za-z]/.test(w)))];
writeFileSync(outFile, JSON.stringify({
  spans: spans.map(([legacy, uni]) => ({ legacy, uni, ...enc.encode(uni) })),
  words: words.map((w) => ({ uni: w, ...enc.encode(w) })),
}));
