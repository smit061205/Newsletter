// Every piece of text on a PDF's pages -- where it sits, its font, size and
// width -- read from the page content streams with pdf-lib (no renderer):
// the transforms (cm, q/Q), the text state (Tf, Tm, Td, TD, T*, TL, Tc, Tw,
// Tz, Ts) and the shown strings (Tj, TJ, ', "), forms (Do) included. Widths
// come from each font's own Widths / W arrays; text is decoded through the
// font's ToUnicode map where it has one (a legacy font has none: its raw
// codes are kept). For extracting a paper's profile (onboard/extract.ts).
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, type PDFObject } from "pdf-lib";

export interface TextItem {
  page: number;
  /** left edge and baseline, pt, from the page's top-left */
  x: number; baseline: number;
  width: number; size: number;
  font: string; // the font's BaseFont, subset prefix removed
  text: string; // Unicode where the font maps it, else its codes as Latin-1
  unicode: boolean;
}
export interface PdfPage { number: number; width: number; height: number; items: TextItem[] }

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

interface FontInfo { name: string; twoByte: boolean; width: (code: number) => number; toUnicode: Map<number, string> | null }

type Tok = { t: "num"; v: number } | { t: "name"; v: string } | { t: "str"; v: number[] } | { t: "op"; v: string } | { t: "arr"; v: Tok[] } | { t: "dict" };

/** The content stream as operands and operators. */
function* tokens(s: string): Generator<Tok> {
  let i = 0;
  const n = s.length;
  const ws = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
  const delim = (c: string) => "()<>[]{}/%".includes(c);
  const stack: Tok[][] = [];
  const emit = function* (tok: Tok): Generator<Tok> {
    if (stack.length) stack[stack.length - 1].push(tok);
    else yield tok;
  };
  while (i < n) {
    const c = s[i];
    if (ws(c)) { i++; continue; }
    if (c === "%") { while (i < n && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (c === "[") { stack.push([]); i++; continue; }
    if (c === "]") { const a = stack.pop() ?? []; i++; yield* emit({ t: "arr", v: a }); continue; }
    if (c === "<" && s[i + 1] === "<") { // a dictionary operand (inline image params, marked content): skipped whole
      let depth = 0;
      while (i < n) {
        if (s[i] === "<" && s[i + 1] === "<") { depth++; i += 2; } else if (s[i] === ">" && s[i + 1] === ">") { depth--; i += 2; if (!depth) break; } else i++;
      }
      yield* emit({ t: "dict" });
      continue;
    }
    if (c === "<") {
      const end = s.indexOf(">", i);
      const hex = s.slice(i + 1, end).replace(/\s+/g, "");
      const bytes: number[] = [];
      for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt((hex[k] + (hex[k + 1] ?? "0")), 16));
      i = end + 1;
      yield* emit({ t: "str", v: bytes });
      continue;
    }
    if (c === "(") {
      const bytes: number[] = [];
      let depth = 1;
      i++;
      while (i < n && depth) {
        const ch = s[i];
        if (ch === "\\") {
          const e = s[i + 1];
          const map: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
          if (e in map) { bytes.push(map[e]); i += 2; } else if (/[0-7]/.test(e)) {
            const m = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)![0];
            bytes.push(parseInt(m, 8) & 0xff); i += 1 + m.length;
          } else if (e === "\r" || e === "\n") { i += e === "\r" && s[i + 2] === "\n" ? 3 : 2; } else { bytes.push(e.charCodeAt(0)); i += 2; }
          continue;
        }
        if (ch === "(") depth++;
        if (ch === ")") { depth--; if (!depth) { i++; break; } }
        bytes.push(ch.charCodeAt(0) & 0xff);
        i++;
      }
      yield* emit({ t: "str", v: bytes });
      continue;
    }
    if (c === "/") {
      let k = i + 1;
      while (k < n && !ws(s[k]) && !delim(s[k])) k++;
      yield* emit({ t: "name", v: s.slice(i + 1, k) });
      i = k;
      continue;
    }
    let k = i;
    while (k < n && !ws(s[k]) && !delim(s[k])) k++;
    if (k === i) { i++; continue; }
    const word = s.slice(i, k);
    i = k;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) { yield* emit({ t: "num", v: Number(word) }); continue; }
    if (word === "BI") { // an inline image: up to EI
      const end = s.indexOf("EI", s.indexOf("ID", i));
      i = end < 0 ? n : end + 2;
      continue;
    }
    yield* emit({ t: "op", v: word });
  }
}

/** A ToUnicode CMap: code -> text. */
function parseCMap(src: string): Map<number, string> {
  const map = new Map<number, string>();
  const hexText = (h: string) => {
    let out = "";
    for (let k = 0; k + 3 < h.length + 1; k += 4) out += String.fromCharCode(parseInt(h.slice(k, k + 4).padEnd(4, "0"), 16));
    return out;
  };
  for (const block of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(m[1], 16), hexText(m[2]));
  }
  for (const block of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (m[3].startsWith("[")) {
        [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].forEach((d, k) => map.set(lo + k, hexText(d[1])));
      } else {
        const base = m[3].slice(1, -1);
        const start = parseInt(base.slice(-4) || "0", 16);
        for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, hexText(base.slice(0, -4)) + String.fromCharCode(start + c - lo));
      }
    }
  }
  return map;
}

export async function readPdfText(bytes: Uint8Array): Promise<PdfPage[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const ctx = doc.context;
  const look = <T extends PDFObject>(o: PDFObject | undefined): T | undefined => (o instanceof PDFRef ? (ctx.lookup(o) as T) : (o as T));
  const num = (o: PDFObject | undefined) => (look<PDFNumber>(o) instanceof PDFNumber ? look<PDFNumber>(o)!.asNumber() : undefined);
  const streamText = (o: PDFObject | undefined): string => {
    const st = look<PDFStream>(o);
    if (!st) return "";
    try { return Buffer.from(st instanceof PDFRawStream ? decodePDFRawStream(st).decode() : (st as PDFStream & { getContents(): Uint8Array }).getContents()).toString("latin1"); }
    catch { return ""; }
  };
  const fontCache = new Map<PDFDict, FontInfo>();
  const fontOf = (d: PDFDict): FontInfo => {
    const cached = fontCache.get(d);
    if (cached) return cached;
    const sub = String(d.get(PDFName.of("Subtype")) ?? "");
    const name = String(d.get(PDFName.of("BaseFont")) ?? "/?").slice(1).replace(/^[A-Z]{6}\+/, "");
    const tu = d.get(PDFName.of("ToUnicode"));
    const toUnicode = tu ? parseCMap(streamText(tu)) : null;
    let info: FontInfo;
    if (sub === "/Type0") {
      const desc = look<PDFArray>(d.get(PDFName.of("DescendantFonts")))?.asArray().map((o) => look<PDFDict>(o)!)[0];
      const dw = num(desc?.get(PDFName.of("DW"))) ?? 1000;
      const widths = new Map<number, number>();
      const w = look<PDFArray>(desc?.get(PDFName.of("W")))?.asArray() ?? [];
      for (let k = 0; k < w.length;) {
        const first = num(w[k])!;
        const next = look<PDFObject>(w[k + 1]);
        if (next instanceof PDFArray) { next.asArray().forEach((x, j) => widths.set(first + j, num(x) ?? dw)); k += 2; } else { const last = num(next)!, v = num(w[k + 2]) ?? dw; for (let c = first; c <= last; c++) widths.set(c, v); k += 3; }
      }
      info = { name, twoByte: true, width: (c) => widths.get(c) ?? dw, toUnicode };
    } else {
      const firstChar = num(d.get(PDFName.of("FirstChar"))) ?? 0;
      const ws = look<PDFArray>(d.get(PDFName.of("Widths")))?.asArray().map((o) => num(o) ?? 0) ?? [];
      const missing = num(look<PDFDict>(d.get(PDFName.of("FontDescriptor")))?.get(PDFName.of("MissingWidth"))) ?? 0;
      // base-14 fonts carry no widths: an average letter
      const avg = /Courier/.test(name) ? 600 : /Times/.test(name) ? 450 : 520;
      info = { name, twoByte: false, width: (c) => (ws.length ? ws[c - firstChar] ?? missing ?? avg : avg) || avg, toUnicode };
    }
    fontCache.set(d, info);
    return info;
  };

  const pages: PdfPage[] = [];
  for (const [pi, page] of doc.getPages().entries()) {
    const { width, height } = page.getSize();
    const items: TextItem[] = [];
    const run = (content: string, resources: PDFDict | undefined, ctm0: M, depth: number) => {
      const fonts = look<PDFDict>(resources?.get(PDFName.of("Font")));
      const xobjects = look<PDFDict>(resources?.get(PDFName.of("XObject")));
      let ctm = ctm0;
      const gstack: M[] = [];
      let tm: M = I, tlm: M = I;
      let tc = 0, tw = 0, th = 1, tl = 0, rise = 0, size = 0;
      let font: FontInfo | null = null;
      const ops: Tok[] = [];
      const show = (str: number[], adjust: (number | number[])[] | null) => {
        if (!font) return;
        const parts = adjust ?? [str];
        const m0 = mul(mul([size * th, 0, 0, size, 0, rise], tm), ctm);
        let text = "";
        let advance = 0; // text space units, along the line
        for (const p of parts) {
          if (typeof p === "number") { advance -= (p / 1000) * size * th; continue; }
          const codes: number[] = [];
          if (font.twoByte) for (let k = 0; k + 1 < p.length; k += 2) codes.push((p[k] << 8) | p[k + 1]);
          else codes.push(...p);
          for (const c of codes) {
            const w = font.width(c) / 1000;
            advance += (w * size + tc + (!font.twoByte && c === 32 ? tw : 0)) * th;
            text += font.toUnicode?.get(c) ?? String.fromCharCode(c);
          }
        }
        const sx = Math.hypot(ctm[0], ctm[1]) * Math.hypot(tm[0], tm[1]);
        const sy = Math.hypot(m0[2], m0[3]);
        if (text.trim() && sy > 0.5) {
          items.push({ page: pi + 1, x: m0[4], baseline: height - m0[5], width: advance * sx, size: sy, font: font.name, text,
                       unicode: !!font.toUnicode });
        }
        tm = mul([1, 0, 0, 1, advance, 0], tm);
      };
      for (const tok of tokens(content)) {
        if (tok.t !== "op") { ops.push(tok); continue; }
        const a = ops.splice(0);
        const n = (k: number) => (a[k] && a[k].t === "num" ? (a[k] as { v: number }).v : 0);
        switch (tok.v) {
          case "q": gstack.push(ctm); break;
          case "Q": ctm = gstack.pop() ?? ctm0; break;
          case "cm": ctm = mul([n(0), n(1), n(2), n(3), n(4), n(5)], ctm); break;
          case "BT": tm = I; tlm = I; break;
          case "Tf": {
            const f = a[0]?.t === "name" ? look<PDFDict>(fonts?.get(PDFName.of(a[0].v))) : undefined;
            font = f ? fontOf(f) : null;
            size = n(1);
            break;
          }
          case "Tc": tc = n(0); break;
          case "Tw": tw = n(0); break;
          case "Tz": th = n(0) / 100; break;
          case "TL": tl = n(0); break;
          case "Ts": rise = n(0); break;
          case "Td": tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm; break;
          case "TD": tl = -n(1); tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm; break;
          case "Tm": tlm = [n(0), n(1), n(2), n(3), n(4), n(5)]; tm = tlm; break;
          case "T*": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; break;
          case "Tj": if (a[0]?.t === "str") show(a[0].v, null); break;
          case "'": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; if (a[0]?.t === "str") show(a[0].v, null); break;
          case "\"": tw = n(0); tc = n(1); tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; if (a[2]?.t === "str") show(a[2].v, null); break;
          case "TJ":
            if (a[0]?.t === "arr") show([], a[0].v.map((x) => (x.t === "num" ? x.v : x.t === "str" ? x.v : 0)) as (number | number[])[]);
            break;
          case "Do": {
            if (depth > 6 || a[0]?.t !== "name") break;
            const xo = look<PDFStream>(xobjects?.get(PDFName.of(a[0].v)));
            const dict = xo?.dict;
            if (!dict || String(dict.get(PDFName.of("Subtype"))) !== "/Form") break;
            const mtx = look<PDFArray>(dict.get(PDFName.of("Matrix")))?.asArray().map((o) => num(o) ?? 0) as M | undefined;
            run(streamText(xo), look<PDFDict>(dict.get(PDFName.of("Resources"))) ?? resources, mul(mtx?.length === 6 ? mtx : I, ctm), depth + 1);
            break;
          }
        }
      }
    };
    const contents = page.node.Contents();
    const parts = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    run(parts.map((p) => streamText(p)).join("\n"), page.node.Resources(), I, 0);
    pages.push({ number: pi + 1, width, height, items });
  }
  return pages;
}
