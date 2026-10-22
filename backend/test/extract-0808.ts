// The "Add a newspaper" extractor's acceptance test: fed the 8 August 2026
// issue as if Capital Kranti were a new paper, it must find Capital Kranti's
// own profile -- the grid, the line pitch, the header bands and where their
// changing fields sit -- within half a point or so of the hand-made one.
//   node --experimental-strip-types --no-warnings backend/test/extract-0808.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractDraft } from "../src/onboard/extract.ts";

const root = path.resolve(import.meta.dirname, "..", "..");
const d = await extractDraft([new Uint8Array(readFileSync(path.join(root, "(196) Capital Kranti_08 august.pdf")))]);
const prof = JSON.parse(readFileSync(path.join(root, "publications", "capital-kranti", "profile.json"), "utf8"));
const chrome = JSON.parse(readFileSync(path.join(root, "publications", "capital-kranti", "chrome.json"), "utf8"));
const pt = (px: number) => (px * 72) / chrome.dpi;
const near = (got: number, want: number, tol: number, what: string) =>
  assert.ok(Math.abs(got - want) <= tol, `${what}: found ${got}, the profile has ${Math.round(want * 100) / 100} (within ${tol})`);

assert.deepEqual(d.page, prof.page, "page size");
assert.equal(d.grid.columns, prof.grid.columns, "columns");
near(d.grid.left, prof.grid.left, 0.6, "left edge");
near(d.grid.column, prof.grid.column, 0.6, "column width");
near(d.grid.gutter, prof.grid.gutter, 0.6, "gutter");
near(d.body.pitch, prof.type.body.pitch, 0.2, "line pitch");
assert.equal(d.language.lang, "gu", "language");
assert.equal(d.language.encoding, "bharati", "legacy encoding");
for (const role of ["first", "inner", "last"] as const) {
  const band = d.bands[role]!;
  near(band.top, pt(chrome.roles[role].bodyTop), 1, `${role} page: where stories start`);
  for (const [kind, f] of Object.entries(chrome.roles[role].fields as Record<string, { redact?: number[] }>)) {
    const got = band.fields.find((x) => x.kind === kind);
    assert.ok(got, `${role} page: the ${kind} field`);
    if (f.redact) near(got!.x, f.redact[0], 1, `${role} page: the ${kind} field's left edge`);
  }
}
console.log(`extract-0808: ok -- grid ${d.grid.columns} x ${d.grid.column}pt (+${d.grid.gutter}), pitch ${d.body.pitch}pt, ` +
            `bands ${d.bands.first.top}/${d.bands.inner?.top}/${d.bands.last?.top}pt, fields found on every page`);
