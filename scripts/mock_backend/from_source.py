#!/usr/bin/env python3
"""Mock backend: the real "(196) Capital Kranti_08 august.pdf" expressed in
the render contract (docs/RENDER_CONTRACT.md, web/src/lib/contract.ts).

The backend decides all layout; this script plays that role for the real
8 August issue, so the frontend (a pure plotter) can be tested against a
page whose correct appearance is known. Every element sits at its true
printed position:

  - chrome (masthead with its edition bar, running headers, footer) ->
    image elements rendered from the source, exactly as printed that day;
  - every text block (kicker, headline, deck, each body column, caption) ->
    one text element: its printed rectangle, the real text decoded from the
    legacy Bharati font (scripts/replica/bharati_decode.py), a font chosen by
    URL, a size matched to the printed letter height, the printed line
    pitch, alignment and first-line indent;
  - every photo and ad -> an image element at its printed rectangle;
  - rules and boxes drawn around stories -> rect / line elements.

Like a real backend, it fits each text block against the fonts it names: a
wrap simulation (HarfBuzz via Pillow/raqm, the shaping Chromium uses) picks
the horizontal scale that fills the block's printed line count without
overflowing it -- so the plotter should report no overflow.

Writes web/src/mocks/issue-2026-08-08.json and images to web/public/replica/.
Refuses to write if an element id repeats or a source text line is left out.
"""
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
from functools import lru_cache

import fitz
from PIL import Image, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "scripts", "replica"))
from bharati_decode import decode, is_legacy  # noqa: E402
from extract_source import ARTICLES, CHROME_BOTTOM, CHROME_TOP, inside  # noqa: E402

SRC = os.path.join(ROOT, "(196) Capital Kranti_08 august.pdf")
PUBLIC = os.path.join(ROOT, "web", "public")
IMG_DIR = os.path.join(PUBLIC, "replica")
OUT = os.path.join(ROOT, "web", "src", "mocks", "issue-2026-08-08.json")
DPI = 300
PX = DPI / 72  # pt -> contract px

FONTS = {
    "hind-regular": ("/fonts/HindVadodara-Regular.ttf", 400),
    "hind-bold": ("/fonts/HindVadodara-Bold.ttf", 700),
    "mukta-bold": ("/fonts/MuktaVaani-Bold.ttf", 700),
    "baloo-bold": ("/fonts/BalooBhai2-Bold.ttf", 700),
    "tinos-bold": ("/fonts/Tinos-Bold.ttf", 700),
}


def font_for(src_font):
    f = src_font.split("+")[-1]
    if "Maruti" in f:
        return "mukta-bold"
    if "TitleTwo" in f:
        return "baloo-bold"
    if "Times" in f:
        return "tinos-bold"
    return "hind-bold" if ("Bold" in f or "Black" in f) else "hind-regular"


def font_path(fid):
    return os.path.join(PUBLIC, FONTS[fid][0].lstrip("/"))


@lru_cache(maxsize=None)
def pil_font(fid):
    return ImageFont.truetype(font_path(fid), 100, layout_engine=ImageFont.Layout.RAQM)


@lru_cache(maxsize=200000)
def width100(fid, text):
    """Advance width of `text` at a 100pt em."""
    return pil_font(fid).getlength(text)


def hexcolor(c):
    return "#%06x" % c


# ------------------------------------------------------------------ lines ---

def page_lines(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            main = max(spans, key=lambda s: len(s["text"].strip()))
            text = "".join(decode(s["text"])[0] if is_legacy(s["font"]) else s["text"] for s in spans)
            fid = font_for(main["font"])
            if fid == "tinos-bold" and re.search("[\u0a80-\u0aff]", text):
                # a mixed line ("... NRI Achievers") needs a face with Gujarati
                # letters; Tinos only for purely Latin lines
                legacy = [s for s in spans if is_legacy(s["font"])]
                fid = font_for(max(legacy, key=lambda s: len(s["text"])) ["font"]) if legacy else "hind-bold"
            out.append({
                "bbox": fitz.Rect(l["bbox"]), "text": re.sub(r"\s+", " ", text).strip(),
                "font": fid, "size": round(max(s["size"] for s in spans), 1),
                "color": hexcolor(main["color"]), "origin_y": main["origin"][1],
            })
    return out


def blocks_of(lines):
    """Consecutive lines of one style in one column -> one text block."""
    blocks = []
    for l in sorted(lines, key=lambda l: (l["bbox"].y0, l["bbox"].x0)):
        home = None
        for b in blocks:
            last = b[-1]
            same_style = last["font"] == l["font"] and abs(last["size"] - l["size"]) < 0.6
            overlap = min(last["bbox"].x1, l["bbox"].x1) - max(last["bbox"].x0, l["bbox"].x0)
            same_col = overlap > 0.6 * min(last["bbox"].width, l["bbox"].width)
            gap = l["bbox"].y0 - last["bbox"].y1
            if same_style and same_col and -2 < gap < 0.9 * l["size"]:
                home = b
                break
        if home is None:
            blocks.append([l])
        else:
            home.append(l)
    return blocks


# ------------------------------------------------------------- measuring ---

def ink_height(img):
    px = img.load()
    rows = [y for y in range(img.height) if any(px[x, y] < 140 for x in range(0, img.width, 2))]
    return (rows[-1] - rows[0] + 1) if rows else 0


def matched_size(page, line):
    """Font size (pt) at which our face's letters are as tall as the printed
    ones for this exact text."""
    pix = page.get_pixmap(dpi=300, clip=line["bbox"], colorspace=fitz.csGRAY)
    h_src = ink_height(Image.frombytes("L", (pix.width, pix.height), pix.samples)) * 72 / 300
    bb = pil_font(line["font"]).getbbox(line["text"])
    h_100 = bb[3] - bb[1]
    if not h_src or not h_100:
        return line["size"] * 0.75
    return 100 * h_src / h_100


def wrap_lines(paras, width, fid, size, hscale, indent):
    n = 0
    for p in paras:
        words, cur, first = p.split(" "), "", True
        for w in words:
            cand = w if not cur else cur + " " + w
            avail = width - (indent if first else 0)
            if not cur or width100(fid, cand) * size / 100 * hscale <= avail * 0.985:
                cur = cand
            else:
                n, cur, first = n + 1, w, False
        n += 1
    return n


def fit_hscale(paras, width, fid, size, indent, target):
    """Widest horizontal scale (0.80-1.15) at which the text still wraps into
    at most `target` lines -- fills the printed width without overflowing."""
    hs = 1.0
    while hs > 0.80 and wrap_lines(paras, width, fid, size, hs, indent) > target:
        hs = round(hs - 0.01, 2)
    while hs < 1.15 and wrap_lines(paras, width, fid, size, round(hs + 0.01, 2), indent) <= target:
        hs = round(hs + 0.01, 2)
    return hs


# ------------------------------------------------------------- elements ---

def render(page, rect, name, dpi=200, fmt="jpg"):
    os.makedirs(IMG_DIR, exist_ok=True)
    path = os.path.join(IMG_DIR, f"{name}.{fmt}")
    pix = page.get_pixmap(dpi=dpi, clip=rect)
    if fmt == "jpg":
        pix.save(path, jpg_quality=90)
    else:
        pix.save(path)
    return f"/replica/{name}.{fmt}"


def box(rect):
    return {"x": round(rect.x0 * PX, 1), "y": round(rect.y0 * PX, 1),
            "width": round(rect.width * PX, 1), "height": round(rect.height * PX, 1)}


def text_element(page, block, eid, aid):
    lines = sorted(block, key=lambda l: l["bbox"].y0)
    rect = fitz.Rect(lines[0]["bbox"])
    for l in lines[1:]:
        rect |= l["bbox"]
    fid = lines[0]["font"]
    origins = [l["origin_y"] for l in lines]
    pitch = statistics.median([b - a for a, b in zip(origins, origins[1:])]) if len(lines) > 1 else rect.height * 1.05
    size = matched_size(page, max(lines, key=lambda l: len(l["text"])))
    # paragraphs: a first-line indent, or a line stopping well short, starts a new one
    paras, cur, indents, prev_short = [], [], [], False
    for l in lines:
        ind = l["bbox"].x0 - rect.x0
        if cur and (ind > 4 or prev_short):
            paras.append(" ".join(cur))
            cur = []
        if ind > 4:
            indents.append(ind)
        cur.append(l["text"])
        prev_short = rect.x1 - l["bbox"].x1 > 18
    paras.append(" ".join(cur))
    indent = statistics.median(indents) if indents and len(lines) > 1 else 0.0
    centered = len(lines) > 1 and all(abs((l["bbox"].x0 + l["bbox"].x1) / 2 - (rect.x0 + rect.x1) / 2) < 3
                                      for l in lines) and len({round(l["bbox"].x0) for l in lines}) > 1
    align = "center" if centered else ("justify" if len(lines) > 2 and fid == "hind-regular" else "left")
    hscale = fit_hscale(paras, rect.width, fid, size, indent, len(lines))
    # the element's box: one line pitch per printed line, centred on the printed lines
    height = len(lines) * pitch
    top = lines[0]["bbox"].y0 - (pitch - lines[0]["bbox"].height) / 2
    el = {"id": eid, "kind": "text", **box(fitz.Rect(rect.x0, top, rect.x1, top + height)),
          "text": "\n\n".join(paras), "font": fid, "size": round(size * PX, 2),
          "lineHeight": round(pitch * PX, 2), "color": lines[0]["color"], "align": align}
    if hscale != 1.0:
        el["hScale"] = hscale
    if indent:
        el["indent"] = round(indent * PX, 1)
    if aid:
        el["articleId"] = aid
    return el


def drawing_elements(page, region, skip, prefix, aid):
    out = []
    for i, d in enumerate(page.get_drawings()):
        r = d["rect"]
        if not inside(tuple(region), tuple(r)) or any(fitz.Rect(s).contains(r) for s in skip):
            continue
        items = d["items"]
        if len(items) == 1 and items[0][0] == "l" and d.get("color"):
            p1, p2 = items[0][1], items[0][2]
            out.append({"id": f"{prefix}-rule{i}", "kind": "line", "x1": round(p1.x * PX, 1), "y1": round(p1.y * PX, 1),
                        "x2": round(p2.x * PX, 1), "y2": round(p2.y * PX, 1),
                        "color": "#%02x%02x%02x" % tuple(int(c * 255) for c in d["color"]),
                        "width": round((d.get("width") or 1) * PX, 2), **({"articleId": aid} if aid else {})})
        elif r.width > 2 and r.height > 2 and (d.get("fill") or all(it[0] == "re" for it in items)):
            # boxes, including rounded ones drawn with curves (e.g. the black
            # "તંત્રી સ્થાનેથી" label behind white text)
            el = {"id": f"{prefix}-box{i}", "kind": "rect", **box(r), **({"articleId": aid} if aid else {})}
            if any(it[0] == "c" for it in items):
                el["radius"] = round(min(r.width, r.height) * 0.25 * PX, 1)
            if d.get("fill"):
                el["fill"] = "#%02x%02x%02x" % tuple(int(c * 255) for c in d["fill"])
            if d.get("color") and d.get("width"):
                el["stroke"] = "#%02x%02x%02x" % tuple(int(c * 255) for c in d["color"])
                el["strokeWidth"] = round(d["width"] * PX, 2)
            if "fill" in el or "stroke" in el:
                out.append(el)
    return out


def build_page(doc, pno, total):
    page = doc[pno - 1]
    W, H = page.rect.width, page.rect.height
    top, bottom = CHROME_TOP[pno], CHROME_BOTTOM.get(pno, H)
    chrome, shapes, pictures, texts = [], [], [], []

    # chrome: exactly as printed that day, as images
    chrome.append({"id": f"p{pno}-header", "kind": "image", **box(fitz.Rect(0, 0, W, top)),
                   "url": render(page, fitz.Rect(0, 0, W, top), f"chrome-p{pno}-header", dpi=300, fmt="png"),
                   "fit": "fill"})
    if pno in CHROME_BOTTOM:
        r = fitz.Rect(0, bottom, W, H)
        chrome.append({"id": f"p{pno}-footer", "kind": "image", **box(r),
                       "url": render(page, r, f"chrome-p{pno}-footer", dpi=300, fmt="png"), "fit": "fill"})

    # by centre, not edge: a big headline's glyph box can start a few points
    # inside the header band (page 2's "MENA ..." line starts at y=35pt)
    lines = [l for l in page_lines(page) if top <= (l["bbox"].y0 + l["bbox"].y1) / 2 <= bottom]
    for aid, apno, typ, rough in [a for a in ARTICLES if a[1] == pno]:
        region = fitz.Rect(rough)
        members = [l for l in lines if inside(rough, tuple(l["bbox"]))]
        for l in members:
            l["claimed"] = aid
        if typ == "ad":
            r = region & fitz.Rect(0, top, W, bottom)
            drawn = [fitz.Rect(i["bbox"]) for i in page.get_image_info() if inside(rough, i["bbox"])]
            drawn += [d["rect"] for d in page.get_drawings() if inside(rough, tuple(d["rect"])) and d["rect"].get_area() > 20]
            drawn += [l["bbox"] for l in members]
            if drawn:
                u = fitz.Rect(drawn[0])
                for d in drawn[1:]:
                    u |= d
                r &= u
            pictures.append({"id": aid, "kind": "image", **box(r), "url": render(page, r, aid), "fit": "fill",
                             "articleId": aid})
            continue
        photos = [fitz.Rect(i["bbox"]) & region for i in page.get_image_info()
                  if inside(rough, i["bbox"]) and i["bbox"][2] - i["bbox"][0] > 20 and i["bbox"][3] - i["bbox"][1] > 20]
        for k, r in enumerate(photos):
            pictures.append({"id": f"{aid}-photo{k}", "kind": "image", **box(r),
                             "url": render(page, r, f"{aid}-photo{k}"), "fit": "fill", "articleId": aid})
        shapes += drawing_elements(page, region, photos, aid, aid)
        text_lines = [l for l in members if not any(p.contains(l["bbox"]) for p in photos)]
        for l in members:
            if l not in text_lines:
                l["claimed"] = aid  # text printed on top of a photo is part of the picture
        for k, blk in enumerate(blocks_of(text_lines)):
            texts.append(text_element(page, blk, f"{aid}-t{k}", aid))

    missing = [l for l in lines if "claimed" not in l]
    if missing:
        sys.exit(f"page {pno}: {len(missing)} source line(s) not in any element, e.g. {missing[0]['text'][:40]!r}")
    return {"number": pno, "width": round(W * PX, 1), "height": round(H * PX, 1),
            "elements": chrome + shapes + pictures + texts}


def measure(issue):
    """Plot the issue with the frontend's own plotter in Chromium
    (web/scripts/measure-plot.mts) and return its warnings."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(issue, f, ensure_ascii=False)
    try:
        out = subprocess.run(
            ["node", "--experimental-strip-types", "--no-warnings", "scripts/measure-plot.mts", f.name],
            cwd=os.path.join(ROOT, "web"), capture_output=True, text=True, check=True)
    finally:
        os.unlink(f.name)
    return json.loads(out.stdout)


def fit_in_chromium(issue, passes=30):
    """What a real backend does before publishing: measure the text with the
    same fonts and engine that will draw it, and tighten any block that
    still runs past its box -- horizontal scale first, then size."""
    by_id = {e["id"]: e for p in issue["pages"] for e in p["elements"]}
    for n in range(passes):
        over = [w for w in measure(issue) if w["kind"] == "text-overflow"]
        if not over:
            print(f"fit: no text overflows after {n} pass(es)")
            return []
        for w in over:
            el = by_id[w["elementId"]]
            hs = el.get("hScale", 1.0)
            # a whole extra line needs a real squeeze; a sliver needs a nudge
            step = 0.05 if w["amount"] >= 0.5 * el["lineHeight"] else 0.01
            if hs - step >= 0.60:
                el["hScale"] = round(hs - step, 3)
            else:
                el["size"] = round(el["size"] * 0.96, 2)
    left = [w for w in measure(issue) if w["kind"] == "text-overflow"]
    print(f"fit: {len(left)} element(s) still overflow after {passes} passes")
    return left


def main():
    doc = fitz.open(SRC)
    pages = [build_page(doc, n, doc.page_count) for n in range(1, doc.page_count + 1)]
    ids = [e["id"] for p in pages for e in p["elements"]]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        sys.exit(f"duplicate element ids: {sorted(dupes)[:5]}")
    issue = {
        "issueDate": "2026-08-08", "issueNumber": 196, "dpi": DPI,
        "fonts": [{"id": fid, "url": url, "weight": w} for fid, (url, w) in FONTS.items()],
        "pages": pages,
    }
    fit_in_chromium(issue)
    json.dump(issue, open(OUT, "w"), ensure_ascii=False)
    kinds = {}
    for e in (e for p in pages for e in p["elements"]):
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    print(f"wrote {OUT}: {len(pages)} pages, {len(ids)} elements {kinds}, "
          f"{os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
