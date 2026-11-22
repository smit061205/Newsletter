// How far down a design page's header reaches, read from the page's own drawing (22 Nov: the
// Gandhinagar Galax design's page headers -- page number, name, date and the rule under them --
// sit 8 mm lower than the other papers', and the copy's stories ran over their lower half).
//
// The page's drawing is read as it draws: text set at its place and size, lines, boxes and photos,
// each where the page's transforms put it. What a scan can't follow (a drawing inside a drawing,
// a photo set into the text) makes it give up: null, and the design is laid as it is.
import { decodePDFRawStream, PDFArray, PDFDict, PDFName, PDFRawStream, PDFStream, type PDFPage } from "pdf-lib";

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const at = (m: M, x: number, y: number): [number, number] => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];

/** The page's content, as tokens: numbers, operators; strings, names, arrays and dictionaries only as markers. */
function* tokens(s: string): Generator<string | number> {
  let i = 0;
  const n = s.length;
  const space = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
  const delim = (c: string) => "()<>[]{}/%".includes(c);
  while (i < n) {
    const c = s[i];
    if (space(c)) { i++; continue; }
    if (c === "%") { while (i < n && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (c === "(") {
      let depth = 0;
      for (; i < n; i++) {
        if (s[i] === "\\") { i++; continue; }
        if (s[i] === "(") depth++;
        else if (s[i] === ")" && --depth === 0) { i++; break; }
      }
      yield "(str)";
      continue;
    }
    if (c === "<" && s[i + 1] === "<") { i += 2; yield "<<"; continue; }
    if (c === ">" && s[i + 1] === ">") { i += 2; yield ">>"; continue; }
    if (c === "<") { i = s.indexOf(">", i) + 1 || n; yield "(str)"; continue; }
    if (c === "[" || c === "]" || c === "{" || c === "}") { i++; yield c; continue; }
    if (c === "/") {
      let j = i + 1;
      while (j < n && !space(s[j]) && !delim(s[j])) j++;
      yield s.slice(i, j);
      i = j;
      continue;
    }
    let j = i;
    while (j < n && !space(s[j]) && !delim(s[j])) j++;
    if (j === i) { i++; continue; }
    const w = s.slice(i, j);
    i = j;
    if (w === "ID") {
      // an inline image's data, up to its end
      const end = s.indexOf("EI", i);
      i = end < 0 ? n : end + 2;
      yield "(inline-image)";
      continue;
    }
    const v = Number(w);
    yield Number.isFinite(v) && /^[+-]?(\d|\.\d)/.test(w) ? v : w;
  }
}

/** Every mark on `page`, as its top and bottom (points from the page's top); null if it can't be read. */
export function marks(page: PDFPage): { top: number; bottom: number }[] | null {
  const crop = page.getCropBox();
  const topY = crop.y + crop.height;
  const contents = page.node.Contents();
  if (!contents) return [];
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => page.doc.context.lookup(r)) : [contents];
  let text = "";
  for (const st of streams) {
    if (!(st instanceof PDFRawStream)) return null;
    text += `${Buffer.from(decodePDFRawStream(st).decode()).toString("latin1")}\n`;
  }
  const xobjects = page.node.Resources()?.lookup(PDFName.of("XObject"));
  const out: { top: number; bottom: number }[] = [];
  const mark = (ys: number[]) => {
    const top = topY - Math.max(...ys), bottom = topY - Math.min(...ys);
    if (Number.isFinite(top) && Number.isFinite(bottom)) out.push({ top, bottom });
  };
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: { ctm: M; lw: number }[] = [];
  let lw = 1;
  let path: number[] = [];
  let tm: M = [1, 0, 0, 1, 0, 0], tlm: M = [1, 0, 0, 1, 0, 0];
  let size = 0, leading = 0, rise = 0;
  const ops: (number | string)[] = [];
  const num = (k: number) => Number(ops[ops.length - k]);
  const textMark = () => {
    // the glyphs' height from the text's own size: a little above the cap height, the descenders below
    const m = mul([size, 0, 0, size, 0, rise], mul(tm, ctm));
    const [, y0] = at(m, 0, -0.3);
    const [, y1] = at(m, 0, 1);
    mark([y0, y1]);
  };
  let depth = 0; // inside an array or dictionary: its parts aren't operands
  for (const t of tokens(text)) {
    if (t === "[" || t === "<<") { depth++; if (depth === 1) ops.push("(group)"); continue; }
    if (t === "]" || t === ">>") { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    if (typeof t === "number" || t.startsWith("/") || t.startsWith("(")) { ops.push(t); continue; }
    switch (t) {
      case "q": stack.push({ ctm, lw }); break;
      case "Q": { const s = stack.pop(); if (s) { ctm = s.ctm; lw = s.lw; } break; }
      case "cm": ctm = mul([num(6), num(5), num(4), num(3), num(2), num(1)], ctm); break;
      case "w": lw = num(1); break;
      case "m": case "l": path.push(...at(ctm, num(2), num(1))); break;
      case "c": path.push(...at(ctm, num(6), num(5)), ...at(ctm, num(4), num(3)), ...at(ctm, num(2), num(1))); break;
      case "v": case "y": path.push(...at(ctm, num(4), num(3)), ...at(ctm, num(2), num(1))); break;
      case "re": {
        const [x, y, w, h] = [num(4), num(3), num(2), num(1)];
        path.push(...at(ctm, x, y), ...at(ctm, x + w, y), ...at(ctm, x, y + h), ...at(ctm, x + w, y + h));
        break;
      }
      case "S": case "s": case "f": case "F": case "f*": case "B": case "B*": case "b": case "b*": {
        if (path.length) {
          const ys = path.filter((_, k) => k % 2 === 1);
          // a stroke is as thick as its pen, half each side
          const half = t === "f" || t === "F" || t === "f*" ? 0 : (lw * Math.hypot(ctm[2], ctm[3])) / 2;
          mark([Math.min(...ys) - half, Math.max(...ys) + half]);
        }
        path = [];
        break;
      }
      case "n": case "W": case "W*": if (t === "n") path = []; break;
      case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case "Tf": size = num(1); break;
      case "TL": leading = num(1); break;
      case "Ts": rise = num(1); break;
      case "Tm": tm = [num(6), num(5), num(4), num(3), num(2), num(1)]; tlm = tm; break;
      case "Td": tlm = mul([1, 0, 0, 1, num(2), num(1)], tlm); tm = tlm; break;
      case "TD": leading = -num(1); tlm = mul([1, 0, 0, 1, num(2), num(1)], tlm); tm = tlm; break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case "Tj": case "TJ": textMark(); break;
      case "'": case '"': tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; textMark(); break;
      case "Do": {
        const name = ops[ops.length - 1];
        const x = typeof name === "string" && xobjects instanceof PDFDict ? xobjects.lookup(PDFName.of(name.slice(1))) : null;
        const sub = x instanceof PDFStream ? x.dict.get(PDFName.of("Subtype"))?.toString() : null;
        // a photo fills its unit square; a drawing inside the drawing isn't followed
        if (sub !== "/Image") return null;
        mark([at(ctm, 0, 0)[1], at(ctm, 0, 1)[1], at(ctm, 1, 0)[1], at(ctm, 1, 1)[1]]);
        break;
      }
      case "BI": case "(inline-image)": return null;
      case "sh": return null;
      default: break;
    }
    ops.length = 0;
  }
  return out;
}

/** How far a header drawn above `limit` (points from the top) reaches below it, and where it begins:
 * what starts above the line and ends under it. Null: nothing does (or the page can't be read). */
export function reachBelow(page: PDFPage, limit: number): { top: number; bottom: number } | null {
  const all = marks(page);
  if (!all) return null;
  // (not a frame round the whole page, or a band down its side: a header is a strip across its top)
  const tall = page.getCropBox().height / 4;
  const header = all.filter((x) => x.top < limit && x.bottom > 0 && x.bottom - x.top < tall);
  if (!header.length) return null;
  const bottom = Math.max(...header.map((x) => x.bottom));
  return bottom > limit ? { top: Math.min(...header.map((x) => x.top)), bottom } : null;
}
