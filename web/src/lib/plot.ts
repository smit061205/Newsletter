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

import type { Element, ImageElement, IssueRender, LineElement, RectElement, TextElement } from "./contract";

export interface PlotWarning {
  page: number;
  elementId?: string;
  articleId?: string;
  kind: "off-page" | "text-overflow" | "image-failed" | "font-failed" | "empty-text";
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
    `color:${el.color ?? "#000"}`, `text-align:${el.align ?? "left"}`,
  ];
  if (el.letterSpacing) styles.push(`letter-spacing:${px(el.letterSpacing)}`);
  if (h !== 1) styles.push(`transform:scaleX(${h})`, "transform-origin:0 0");
  if (el.vAlign && el.vAlign !== "top") {
    styles.push("display:flex", "flex-direction:column", `justify-content:${el.vAlign === "middle" ? "center" : "flex-end"}`);
  }
  const indent = el.indent ? ` style="text-indent:${px(el.indent)}"` : "";
  const paras = el.text
    .split(/\n[ \t]*\n/)
    .map((p) => `<p${indent}>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div class="t" data-el="${esc(el.id)}" style="${styles.join(";")}">${paras}</div>`;
}

function imageHtml(el: ImageElement, px: (v: number) => string): string {
  return (
    `<img class="i" data-el="${esc(el.id)}" alt="" src="${esc(el.url)}" style="left:${px(el.x)};top:${px(el.y)};` +
    `width:${px(el.width)};height:${px(el.height)};object-fit:${el.fit ?? "cover"}">`
  );
}

function rectHtml(el: RectElement, px: (v: number) => string): string {
  const styles = [`left:${px(el.x)}`, `top:${px(el.y)}`, `width:${px(el.width)}`, `height:${px(el.height)}`];
  if (el.fill) styles.push(`background:${el.fill}`);
  if (el.stroke) styles.push(`border:${px(el.strokeWidth ?? 1)} solid ${el.stroke}`);
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

function elementHtml(el: Element, pageW: string, pageH: string, px: (v: number) => string): string {
  switch (el.kind) {
    case "text": return textHtml(el, px);
    case "image": return imageHtml(el, px);
    case "rect": return rectHtml(el, px);
    case "line": return lineHtml(el, pageW, pageH, px);
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
  const body = page.elements.map((el) => elementHtml(el, W, H, px)).join("");
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Page ${page.number}</title><style>` +
    `${faces}@page{size:${W} ${H};margin:0}` +
    `html,body{margin:0;padding:0;background:transparent}` +
    `.page{position:relative;width:${W};height:${H};overflow:hidden;background:${page.background ?? "#fff"}}` +
    `.page>*{position:absolute;margin:0;box-sizing:border-box}` +
    `.t{overflow:visible;white-space:normal;overflow-wrap:break-word}.t p{margin:0}` +
    `.l{pointer-events:none;overflow:visible}` +
    `</style></head><body data-page="${page.number}"><div class="page">${body}</div>` +
    `<script type="application/json" id="plot-meta">${JSON.stringify(meta).replace(/</g, "\\u003c")}</script>` +
    `<script>${PROBE}</script></body></html>`
  );
}

/** Problems visible from the JSON alone, without laying anything out. */
export function staticWarnings(issue: IssueRender): PlotWarning[] {
  const out: PlotWarning[] = [];
  for (const page of issue.pages) {
    for (const el of page.elements) {
      const box = el.kind === "line"
        ? { x0: Math.min(el.x1, el.x2), y0: Math.min(el.y1, el.y2), x1: Math.max(el.x1, el.x2), y1: Math.max(el.y1, el.y2) }
        : { x0: el.x, y0: el.y, x1: el.x + el.width, y1: el.y + el.height };
      if (box.x0 < 0 || box.y0 < 0 || box.x1 > page.width || box.y1 > page.height) {
        out.push({ page: page.number, elementId: el.id, articleId: el.articleId, kind: "off-page",
                   detail: "extends past the page edge (clipped when printed)" });
      }
      if (el.kind === "text" && !el.text.trim()) {
        out.push({ page: page.number, elementId: el.id, articleId: el.articleId, kind: "empty-text", detail: "no text" });
      }
    }
  }
  return out;
}

