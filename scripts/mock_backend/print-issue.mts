// Prints an issue JSON to PDF with the frontend's own printer (shared/src/pdf.ts),
// fonts and images served from web/public -- no dev server. The mock backend
// uses it to measure where its lines actually land on the printed page.
//
//   node --experimental-strip-types --no-warnings scripts/mock_backend/print-issue.mts <issue.json> <out.pdf>
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { printIssue } from "@ck/shared/pdf";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const issue = JSON.parse(await readFile(process.argv[2], "utf8"));
// /private/<paper>/... is a publication's own folder (its licensed fonts)
const resolve = (pathname: string) => {
  const p = decodeURIComponent(pathname);
  const m = p.match(/^\/private\/([a-z0-9-]+)\/(.+)$/);
  return m ? path.join(root, "publications", m[1], m[2]) : path.join(root, "web", "public", p);
};
const { pdf, warnings } = await printIssue(issue, { origin: "http://plot.local", resolve });
await writeFile(process.argv[3], pdf);
console.log(JSON.stringify(warnings));
