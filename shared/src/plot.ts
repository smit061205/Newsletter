// Plots one page of the backend's IssueRender (contract.ts) onto a blank page
// of the size the backend gave, as standalone HTML. This is the frontend's
// only renderer: the website shows this HTML, and the PDF is this HTML printed
// by Chromium -- so screen and print can't disagree.
//
// It makes no layout decisions. Each element is drawn exactly where the
// backend put it, in array order (later = on top). The one thing a browser
// must do itself is wrap a text element's words inside the width it was given;
// the plotter never shrinks, moves or clips anything to make text fit. If text
// runs past its box, that's reported as a warning (see PROBE) and left visible.

import type { Element, ImageElement, IssueRender, LineElement, PathElement, RectElement, TextElement, TextRun } from "./contract.ts";

export interface PlotWarning {
  page: number;
  elementId?: string;
  articleId?: string;
  kind: "off-page" | "text-overflow" | "image-failed" | "font-failed" | "empty-text" | "overlap" | "line-fit";
  detail: string;
  /** text-overflow only: how far the text runs past its box, in contract px */
  amount?: number;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fontFamily = (id: string) => `f-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** Contract units (px at `dpi`) -> CSS px (96 per inch). */
function scaler(dpi: number) {
  const k = 96 / dpi;
  return (v: number) => `${+(v * k).toFixed(3)}px`;
}

function textHtml(el: TextElement, px: (v: number) => string): string {
  const h = el.hScale ?? 1;
  // Squeeze by setting the glyphs in a box 1/h wider and scaling it back, so
  // the element still occupies exactly the width the backend gave.
  const styles = [
    `left:${px(el.x)}`, `top:${px(el.y)}`,
    `width:${px(el.width / h)}`, `height:${px(el.height)}`,
    `font-family:'${fontFamily(el.font)}'`, `font-size:${px(el.size)}`, `line-height:${px(el.lineHeight)}`,
    `color:${el.color ?? "#000"}`, `text-align:${el.align === "justify-all" ? "justify" : el.align ?? "left"}`,
  ];
  if (el.letterSpacing) styles.push(`letter-spacing:${px(el.letterSpacing)}`);
  if (el.wordSpacing) styles.push(`word-spacing:${px(el.wordSpacing)}`);
  // (hard shadows round the letters, not an outline: an outlined font isn't embedded in the PDF)
  if (el.thicken) {
    const t = el.thicken / 2, c = el.color ?? "#000";
    styles.push(`text-shadow:${[[t, 0], [-t, 0], [0, t], [0, -t]].map(([x, y]) => `${px(x)} ${px(y)} 0 ${c}`).join(",")}`);
  }
  if (el.nowrap) styles.push("white-space:nowrap");
  if (h !== 1) styles.push(`transform:scaleX(${h})`, "transform-origin:0 0");
  if (el.vAlign && el.vAlign !== "top") {
    styles.push("display:flex", "flex-direction:column", `justify-content:${el.vAlign === "middle" ? "center" : "flex-end"}`);
  }
  // Paragraphs of lines of styled pieces. Each line ended by "\n" is its own
  // block, so in justified text it can be stretched to the full width like a
  // printed line; a paragraph's last line keeps the normal alignment unless
  // it too ends with "\n" (a paragraph running on into the next column).
  type Line = { html: string[]; forced: boolean };
  const paras: Line[][] = [[{ html: [], forced: false }]];
  for (const run of runsOf(el)) {
    const open = runStyle(run, px);
    run.text.split(/(\n[ \t]*\n|\n)/).forEach((piece, i) => {
      const lines = paras[paras.length - 1];
      if (i % 2 === 0) {
        if (piece) lines[lines.length - 1].html.push(open ? `<span style="${open}">${esc(piece)}</span>` : esc(piece));
      } else if (piece === "\n") {
        lines[lines.length - 1].forced = true;
        lines.push({ html: [], forced: false });
      } else {
        paras.push([{ html: [], forced: false }]);
      }
    });
  }
  for (const lines of paras) {
    // a trailing "\n" only marks the line before it; it adds no empty line
    if (lines.length > 1 && !lines[lines.length - 1].html.length) lines.pop();
  }
  const justify = el.align === "justify" || el.align === "justify-all";
  const all = el.align === "justify-all";
  const body = paras
    .map((lines) => {
      const html = lines.map((line, i) => {
        const s: string[] = [];
        if (i === 0 && el.indent) s.push(`text-indent:${px(el.indent)}`);
        if (justify && (all || line.forced)) s.push("text-align-last:justify");
        return `<span class="ln"${s.length ? ` style="${s.join(";")}"` : ""}>${line.html.join("") || "&#8203;"}</span>`;
      });
      return `<p>${html.join("")}</p>`;
    })
    .join("");
  // text in a legacy font's glyph codes reads as its Unicode to search and screen readers
  const label = el.plainText ? ` role="text" aria-label="${esc(el.plainText)}"` : "";
  // a line set to fill its box exactly is checked to fill it
  const fit = el.nowrap && el.align === "justify-all" ? " data-fit" : "";
  const dir = el.direction === "rtl" ? ` dir="rtl"` : "";
  const lang = el.lang ? ` lang="${esc(el.lang)}"` : "";
  return `<div class="t" data-el="${esc(el.id)}"${fit}${label}${dir}${lang} style="${styles.join(";")}">${body}</div>`;
}

/** The element's text as styled runs (a plain string is one unstyled run). */
export function runsOf(el: TextElement): TextRun[] {
  return typeof el.text === "string" ? [{ text: el.text }] : el.text;
}

/** Plain text of an element, all runs joined. */
export const plainText = (el: TextElement) => runsOf(el).map((r) => r.text).join("");

function runStyle(run: TextRun, px: (v: number) => string): string {
  const s: string[] = [];
  // a run in another face or size must not change where the line's baseline
  // sits (a taller face would grow the line box and push the text down): the
  // element's lineHeight alone sets the line
  if (run.font || run.size) s.push("line-height:0");
  if (run.font) s.push(`font-family:'${fontFamily(run.font)}'`);
  if (run.size) s.push(`font-size:${px(run.size)}`);
  if (run.color) s.push(`color:${run.color}`);
  return s.join(";");
}

function imageHtml(el: ImageElement, px: (v: number) => string): string {
  return (
    `<img class="i" data-el="${esc(el.id)}" alt="" src="${esc(el.url)}" style="left:${px(el.x)};top:${px(el.y)};` +
    `width:${px(el.width)};height:${px(el.height)};object-fit:${el.fit ?? "cover"}">`
  );
}

function rectHtml(el: RectElement, px: (v: number) => string): string {
  // A stroke is centred on the rectangle's edge, as in PDF and SVG: a CSS
  // border is drawn inside the box, so the box grows by half the stroke.
  const sw = el.stroke ? (el.strokeWidth ?? 1) : 0;
  const styles = [`left:${px(el.x - sw / 2)}`, `top:${px(el.y - sw / 2)}`, `width:${px(el.width + sw)}`, `height:${px(el.height + sw)}`];
  if (el.fill) styles.push(`background:${el.fill}`, "background-clip:padding-box");
  if (el.stroke) styles.push(`border:${px(sw)} solid ${el.stroke}`);
  if (el.radius) styles.push(`border-radius:${px(el.radius)}`);
  return `<div class="r" data-el="${esc(el.id)}" style="${styles.join(";")}"></div>`;
}

function lineHtml(el: LineElement, pageW: string, pageH: string, px: (v: number) => string): string {
  const dash = el.dash?.length ? ` stroke-dasharray="${el.dash.map((d) => px(d).replace("px", "")).join(" ")}"` : "";
  return (
    `<svg class="l" data-el="${esc(el.id)}" style="left:0;top:0;width:${pageW};height:${pageH}" ` +
    `viewBox="0 0 ${pageW.replace("px", "")} ${pageH.replace("px", "")}">` +
    `<line x1="${px(el.x1).replace("px", "")}" y1="${px(el.y1).replace("px", "")}" ` +
    `x2="${px(el.x2).replace("px", "")}" y2="${px(el.y2).replace("px", "")}" ` +
    `stroke="${esc(el.color)}" stroke-width="${px(el.width).replace("px", "")}"${dash}/></svg>`
  );
}

function pathHtml(el: PathElement, pageW: string, pageH: string, dpi: number): string {
  // the path is in contract px; one viewBox in those units maps it onto the page
  const k = 96 / dpi;
  const w = +(parseFloat(pageW) / k).toFixed(3);
  const h = +(parseFloat(pageH) / k).toFixed(3);
  const stroke = el.stroke ? ` stroke="${esc(el.stroke)}" stroke-width="${el.strokeWidth ?? 1}"` : "";
  return (
    `<svg class="l" data-el="${esc(el.id)}" style="left:0;top:0;width:${pageW};height:${pageH}" viewBox="0 0 ${w} ${h}">` +
    `<path d="${esc(el.d)}" fill="${esc(el.fill ?? "none")}"${stroke}/></svg>`
  );
}

function elementHtml(el: Element, pageW: string, pageH: string, px: (v: number) => string, dpi: number): string {
  switch (el.kind) {
    case "text": return textHtml(el, px);
    case "image": return imageHtml(el, px);
    case "rect": return rectHtml(el, px);
    case "line": return lineHtml(el, pageW, pageH, px);
    case "path": return pathHtml(el, pageW, pageH, dpi);
  }
}

/** Runs inside the plotted page once fonts and images have settled. Reports
 * what only a real layout can reveal -- text wrapping past its box, images
 * or fonts that failed to load -- into window.__plotWarnings, and to the
 * parent window when shown in an iframe. Never changes the page. */
const PROBE = `
(function () {
  var page = +document.body.dataset.page, out = [];
  var meta = JSON.parse(document.getElementById("plot-meta").textContent);
  function add(kind, id, detail, amount) {
    out.push({ page: page, elementId: id || undefined, articleId: id && meta[id] || undefined, kind: kind,
               detail: detail, amount: amount });
  }
  var imgs = Array.prototype.slice.call(document.querySelectorAll("img.i"));
  var loaded = imgs.map(function (img) {
    return img.complete ? Promise.resolve() : new Promise(function (r) { img.onload = img.onerror = r; });
  });
  var settled = new Promise(function (r) {
    if (document.readyState === "complete") r(); else window.addEventListener("load", function () { r(); });
  });
  settled.then(function () { return Promise.all([document.fonts.ready].concat(loaded)); }).then(function () {
    imgs.forEach(function (img) {
      if (!img.naturalWidth) add("image-failed", img.dataset.el, "could not load " + img.getAttribute("src"));
    });
    document.fonts.forEach(function (f) {
      if (f.status === "error") add("font-failed", null, "could not load font " + f.family);
    });
    document.querySelectorAll("div.t").forEach(function (el) {
      // the element must actually be set in the backend's font, not a silent fallback
      if (getComputedStyle(el).fontFamily.indexOf("f-") === -1) add("font-failed", el.dataset.el, "not set in its declared font");
      // A wrapped line that doesn't fit overflows by a whole line; anything
      // under half a line is just a tall face's glyphs overhanging a tight
      // line height -- no text is lost, so it isn't reported.
      var over = el.scrollHeight - el.clientHeight;
      if (over > 0.5 * parseFloat(getComputedStyle(el).lineHeight)) {
        var units = Math.round(over * meta.__dpi / 96);
        add("text-overflow", el.dataset.el, "text runs " + units + " px past its box", units);
      }
    });
    // A line the backend set to fill its box exactly must print at that
    // width: where its last letter ends (less the spacing CSS adds after
    // it), against the box's right edge, after any squeeze -- within 1.5 CSS px
    // (0.4mm in print; a line 4px short of 2,000 sent 31 Oct's paper round its repairs).
    document.querySelectorAll("div.t[data-fit]").forEach(function (el) {
      // from the first letter to the last (not the line's block box, which is always the full width)
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), first = walker.nextNode(), last = first;
      for (var n = first; n; n = walker.nextNode()) last = n;
      if (!first) return;
      var range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(last, last.data.length);
      var box = el.getBoundingClientRect(), squeeze = box.width / el.offsetWidth;
      var trailing = (parseFloat(getComputedStyle(el).letterSpacing) || 0) * squeeze;
      var off = range.getBoundingClientRect().right - trailing - box.right;
      if (Math.abs(off) > 1.5) {
        var units = Math.round(Math.abs(off) * meta.__dpi / 96);
        add("line-fit", el.dataset.el, "line ends " + units + " px " + (off > 0 ? "past" : "short of") + " its box", units);
      }
    });
    // Letters running into other letters, a picture, a rule or a box edge.
    // The INK box of every word: its box on the page gives the baseline (top
    // + its font's ascent), canvas gives how far that word's letters reach
    // above and below it -- per word, so a descender in one word never
    // "meets" a tall mark that sits over a different word. A touch of up to
    // 1.5 CSS px (about 1pt) is let through.
    var GRACE = 1.5, ctx = document.createElement("canvas").getContext("2d");
    var inks = [];
    document.querySelectorAll("div.t").forEach(function (el) {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (var node = walker.nextNode(); node; node = walker.nextNode()) {
        var cs = getComputedStyle(node.parentNode);
        ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
        var re = /\\S+/g, mm;
        while ((mm = re.exec(node.data))) {
          var word = mm[0].replace(/\u200b/g, "");
          if (!word) continue;
          var range = document.createRange();
          range.setStart(node, mm.index);
          range.setEnd(node, mm.index + mm[0].length);
          var m = ctx.measureText(word);
          Array.prototype.forEach.call(range.getClientRects(), function (r) {
            var base = r.top + m.fontBoundingBoxAscent;
            inks.push({ id: el.dataset.el, x0: r.left, x1: r.right, y0: base - m.actualBoundingBoxAscent,
                        y1: base + m.actualBoundingBoxDescent });
          });
        }
      }
    });
    var others = [];
    document.querySelectorAll("img.i").forEach(function (img) {
      var r = img.getBoundingClientRect();
      others.push({ id: img.dataset.el, what: "image", x0: r.left, x1: r.right, y0: r.top, y1: r.bottom });
    });
    document.querySelectorAll("svg.l line").forEach(function (line) {
      var r = line.getBoundingClientRect(), w = parseFloat(line.getAttribute("stroke-width")) / 2;
      others.push({ id: line.parentNode.dataset.el, what: "rule", x0: r.left - w, x1: r.right + w, y0: r.top - w, y1: r.bottom + w });
    });
    document.querySelectorAll("div.r").forEach(function (box) {
      var bw = parseFloat(getComputedStyle(box).borderTopWidth);
      if (!bw) return;
      var r = box.getBoundingClientRect(), id = box.dataset.el;
      [[r.left, r.right, r.top, r.top + bw], [r.left, r.right, r.bottom - bw, r.bottom],
       [r.left, r.left + bw, r.top, r.bottom], [r.right - bw, r.right, r.top, r.bottom]].forEach(function (e) {
        others.push({ id: id, what: "box edge", x0: e[0], x1: e[1], y0: e[2], y1: e[3] });
      });
    });
    function hit(a, b) {
      return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > GRACE && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > GRACE;
    }
    var said = {};
    function report(a, otherId, what) {
      var key = a.id + "|" + otherId;
      if (said[key]) return;
      said[key] = said[otherId + "|" + a.id] = true;
      add("overlap", a.id, "text runs into " + what + " " + otherId);
    }
    inks.sort(function (a, b) { return a.y0 - b.y0; });
    for (var i = 0; i < inks.length; i++) {
      for (var j = i + 1; j < inks.length && inks[j].y0 < inks[i].y1; j++) {
        if (inks[i].id !== inks[j].id && hit(inks[i], inks[j])) report(inks[i], inks[j].id, "text");
      }
      others.forEach(function (o) {
        // text set wholly inside a picture is printed on it on purpose (a date on the masthead art)
        var inside = o.what === "image" && inks[i].x0 >= o.x0 && inks[i].x1 <= o.x1 && inks[i].y0 >= o.y0 && inks[i].y1 <= o.y1;
        if (!inside && hit(inks[i], o)) report(inks[i], o.id, o.what);
      });
    }
    window.__plotWarnings = out;
    window.__plotDone = true;
    if (window.parent !== window) window.parent.postMessage({ type: "plot-warnings", page: page, warnings: out }, "*");
  });
})();
`;

/** Standalone HTML for one page. Relative URLs (fonts, images) resolve
 * against wherever this HTML is served from. */
export function plotPage(issue: IssueRender, pageNumber: number): string {
  const page = issue.pages.find((p) => p.number === pageNumber);
  if (!page) throw new Error(`issue has no page ${pageNumber}`);
  const px = scaler(issue.dpi);
  const W = px(page.width);
  const H = px(page.height);
  const faces = issue.fonts
    .map((f) =>
      `@font-face{font-family:"${fontFamily(f.id)}";src:url("${esc(f.url)}");` +
      `font-weight:${f.weight ?? 400};font-style:${f.style ?? "normal"};font-display:block}`)
    .join("");
  const meta: Record<string, string | number> = { __dpi: issue.dpi };
  for (const el of page.elements) if (el.articleId) meta[el.id] = el.articleId;
  const body = page.elements.map((el) => elementHtml(el, W, H, px, issue.dpi)).join("");
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Page ${page.number}</title><style>` +
    `${faces}@page{size:${W} ${H};margin:0}` +
    `html,body{margin:0;padding:0;background:transparent}` +
    `.page{position:relative;width:${W};height:${H};overflow:hidden;background:${page.background ?? "#fff"}}` +
    `.page>*{position:absolute;margin:0;box-sizing:border-box}` +
    `.t{overflow:visible;white-space:normal;overflow-wrap:break-word}.t p{margin:0}.t .ln{display:block}` +
    `.l{pointer-events:none;overflow:visible}` +
    `</style></head><body data-page="${page.number}"><div class="page">${body}</div>` +
    `<script type="application/json" id="plot-meta">${JSON.stringify(meta).replace(/</g, "\\u003c")}</script>` +
    `<script>${PROBE}</script></body></html>`
  );
}

/** Bounds of absolute SVG path data (control points included -- enough to
 * tell whether a shape leaves the page). */
function pathBounds(d: string) {
  const n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Problems visible from the JSON alone, without laying anything out. */
export function staticWarnings(issue: IssueRender): PlotWarning[] {
  const out: PlotWarning[] = [];
  for (const page of issue.pages) {
    for (const el of page.elements) {
      const box = el.kind === "line"
        ? { x0: Math.min(el.x1, el.x2), y0: Math.min(el.y1, el.y2), x1: Math.max(el.x1, el.x2), y1: Math.max(el.y1, el.y2) }
        : el.kind === "path" ? pathBounds(el.d)
        : { x0: el.x, y0: el.y, x1: el.x + el.width, y1: el.y + el.height };
      // half a pixel for rounding: 0.02px past the edge (a line set to end at it) can't print
      const e = 0.5;
      if (box.x0 < -e || box.y0 < -e || box.x1 > page.width + e || box.y1 > page.height + e) {
        out.push({ page: page.number, elementId: el.id, articleId: el.articleId, kind: "off-page",
                   detail: "extends past the page edge (clipped when printed)" });
      }
      if (el.kind === "text" && !plainText(el).trim()) {
        out.push({ page: page.number, elementId: el.id, articleId: el.articleId, kind: "empty-text", detail: "no text" });
      }
    }
  }
  return out;
}

