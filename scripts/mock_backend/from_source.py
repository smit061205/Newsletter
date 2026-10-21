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
    a text element: its printed rectangle, the real text decoded from the
    legacy Bharati font (scripts/replica/bharati_decode.py) with the printed
    line breaks kept, a font chosen by URL (English words in Times as serif
    runs), a size matched to the printed letter height, the printed line
    pitch, alignment and first-line indent; headline lines one element each;
  - every photo and ad -> an image element at its printed rectangle;
  - rules and boxes drawn around stories -> rect / line elements.

Like a real backend, it fits each text block against the fonts it names: it
picks the horizontal scale at which every printed line fits its width, then
measures the result with the frontend's own plotter in Chromium and tightens
anything that still runs past its box -- so the plotter reports no overflow.

Writes web/src/mocks/issue-2026-08-08.json and images to web/public/replica/.
Refuses to write if an element id repeats or a source text line is left out.
"""
import json
import math
import os
import re
import statistics
import subprocess
import sys
import tempfile
from functools import lru_cache

import fitz
from fontTools.ttLib import TTFont
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
    "serif-regular": ("/fonts/LiberationSerif-Regular.ttf", 400),
}


# --gopika: set every line printed in GopikaTwo in the paper's own font, from
# the paper's own glyph codes, at its printed size -- no substitute face, no
# squeeze. A check of the frontend against the source (scripts/replica/line_diff.py),
# written to out/replica/; the website's mock data stays in Unicode fonts.
EXACT = "--gopika" in sys.argv
if EXACT:
    FONTS.update({
        "gopika-regular": ("/private/capital-kranti/fonts/gopika-two-regular.ttf", 400),
        "gopika-bold": ("/private/capital-kranti/fonts/gopika-two-bold.ttf", 700),
    })
    OUT = os.path.join(ROOT, "out", "replica", "issue-2026-08-08-gopika.json")


def exact_font(src_font):
    """The paper's own font for a source span, when we have it (--gopika)."""
    f = src_font.split("+")[-1]
    if not EXACT or "GopikaTwo" not in f:
        return None
    return "gopika-bold" if "Bold" in f else "gopika-regular"


def font_for(src_font):
    exact = exact_font(src_font)
    if exact:
        return exact
    f = src_font.split("+")[-1]
    if "Maruti" in f:
        return "mukta-bold"
    if "TitleTwo" in f:
        return "baloo-bold"
    if "Times" in f:
        # English set in Times: Tinos / Liberation Serif share its metrics
        return "tinos-bold" if "Bold" in f else "serif-regular"
    return "hind-bold" if ("Bold" in f or "Black" in f) else "hind-regular"


LATIN = ("tinos-bold", "serif-regular")
DISPLAY = 20  # pt: headline-size text


CSS_PX = 96 / DPI  # contract px -> the CSS px Chromium lays the page out in


@lru_cache(maxsize=None)
def font_metrics(fid):
    """(ascent, descent) in em, as Chromium uses them for the line box:
    the OS/2 typo metrics when the font asks for them (USE_TYPO_METRICS),
    else hhea -- measured to match Chromium on every font we ship."""
    t = TTFont(font_path(fid))
    upm, os2, hhea = t["head"].unitsPerEm, t["OS/2"], t["hhea"]
    if os2.fsSelection & (1 << 7):
        return os2.sTypoAscender / upm, -os2.sTypoDescender / upm
    return hhea.ascent / upm, -hhea.descent / upm


def line_top(fid, size_px, line_px, baseline_pt):
    """Element top (contract px) that puts its first line's baseline on
    `baseline_pt` in Chromium's printed PDF. Measured, not assumed: Chromium
    places the baseline ascent + floor(half-leading) below the line top, with
    ascent and descent rounded to whole CSS px, then prints the line with its
    top rounded to a whole CSS px and the baseline 1 CSS px lower still -- so
    baselines land on a 0.75pt grid and the best top is a whole CSS px."""
    asc, desc = font_metrics(fid)
    s, line = size_px * CSS_PX, line_px * CSS_PX
    a, d = round(asc * s), round(desc * s)
    base = a + math.floor((line - (a + d)) / 2)
    target = baseline_pt * 96 / 72
    return round(target - base - 1) / CSS_PX


def font_path(fid):
    url = FONTS[fid][0]
    m = re.match(r"^/private/([a-z0-9-]+)/(.+)$", url)
    if m:  # a publication's own (licensed) font, kept outside the public folder
        return os.path.join(ROOT, "publications", m.group(1), m.group(2))
    return os.path.join(PUBLIC, url.lstrip("/"))


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
    for b in page.get_text("rawdict")["blocks"]:
        # line boxes from the characters themselves, spaces left out: the
        # source indents with leading spaces, and a box that includes them
        # starts the line up to 30pt early
        for l in b.get("lines", []):
            for sp in l["spans"]:
                chars = sp.pop("chars", [])
                sp["text"] = "".join(c["c"] for c in chars)
                ink = [fitz.Rect(c["bbox"]) for c in chars if c["c"].strip()]
                if ink:
                    tight = ink[0]
                    for r in ink[1:]:
                        tight = tight | r
                    sp["bbox"] = tuple(tight)
            spans = [sp for sp in l["spans"] if sp["text"].strip()]
            if spans:
                tight = fitz.Rect(spans[0]["bbox"])
                for sp in spans[1:]:
                    tight |= sp["bbox"]
                l["bbox"] = tuple(tight)
        # A justified printed line is sometimes stored as several pieces
        # ("પ્રતિબંધ " / "અને " / "નિવારણ)") on one baseline: join them back
        # into one line, or each piece becomes a stray one-word element.
        rows = []
        for l in b.get("lines", []):
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            y = spans[0]["origin"][1]
            row = next((r for r in rows if abs(r["y"] - y) < 1.0), None)
            if row is None:
                rows.append({"y": y, "bbox": fitz.Rect(l["bbox"]), "spans": spans})
            else:
                row["bbox"] |= l["bbox"]
                row["spans"] += [{**spans[0], "text": " " + spans[0]["text"]}, *spans[1:]]
        for row in rows:
            spans = sorted(row["spans"], key=lambda s: s["bbox"][0])
            main = max(spans, key=lambda s: len(s["text"].strip()))
            # pieces in their own face: English words in Times inside a
            # Gujarati sentence ("NRI Achievers", "XECH"), and the legacy
            # font's bullet, which it draws as a large round dot
            pieces = []  # [unicode, font or None, size or None, bbox, the paper's own glyph codes]
            for sp in spans:
                bb = fitz.Rect(sp["bbox"])
                if is_legacy(sp["font"]):
                    raws = sp["text"].split("\u2022")
                    for k, part in enumerate(decode(sp["text"])[0].split("\u2022")):
                        if k:
                            pieces.append(["\u25cf", "tinos-bold", sp["size"], bb, "\u25cf"])
                        pieces.append([part, None, None, bb, raws[k] if k < len(raws) else part])
                else:
                    f = font_for(sp["font"])
                    pieces.append([sp["text"], f if f in LATIN else None, sp["size"] if f in LATIN else None, bb, sp["text"]])
            text = re.sub(r"\s+", " ", "".join(p[0] for p in pieces)).strip()
            fid = font_for(main["font"])
            if fid in LATIN and re.search("[\u0a80-\u0aff]", text):
                # a mixed line needs a Gujarati face for the element; the
                # English pieces keep their serif as runs
                legacy = [s for s in spans if is_legacy(s["font"])]
                fid = font_for(max(legacy, key=lambda s: len(s["text"]))["font"]) if legacy else "hind-bold"
            if fid in LATIN:
                for p in pieces:
                    if p[1] == fid:
                        p[1] = p[2] = None
            legacy_fonts = {sp["font"].split("+")[-1] for sp in spans if is_legacy(sp["font"])}
            exact = EXACT and legacy_fonts and all("GopikaTwo" in f for f in legacy_fonts)
            line = {
                "exact": bool(exact),
                "bbox": fitz.Rect(row["bbox"]), "text": text, "runs": tidy_runs(pieces),
                "font": fid, "size": round(max(s["size"] for s in spans), 1),
                "color": hexcolor(main["color"]), "origin_y": main["origin"][1],
            }
            out += split_display(line)
    return out


def split_display(line):
    """A headline line mixing scripts ("XECH એ એમેઝોન ...") -> one line per
    piece, each at its printed position. One element can only squeeze all its
    glyphs alike, and the Gujarati face needs far more squeeze than Times
    does, so the English word gets an element of its own."""
    runs = line["runs"]
    if line["size"] < DISPLAY or not any(r[1] for r in runs) or all(r[1] for r in runs):
        return [line]
    out = []
    for text, font, size, bb, raw in runs:
        if not text.strip():
            continue
        bb = fitz.Rect(bb)
        space = 0.25 * (size or line["size"])  # a word space, which the printed box includes
        if text.startswith(" "):
            bb.x0 += space
        if text.endswith(" "):
            bb.x1 -= space
        out.append({**line, "bbox": bb, "text": text.strip(),
                    "runs": [[text.strip(), None, None, bb, raw.strip()]], "font": font or line["font"],
                    "size": size or line["size"], "solo": True})
    return out


def tidy_runs(pieces):
    """Merge neighbouring pieces of one style; collapse and trim spaces.
    Each run is [text, font or None, size or None, printed bbox, raw glyph codes]."""
    runs = []
    for text, font, size, bb, raw in pieces:
        text = re.sub(r"\s+", " ", text)
        raw = re.sub(r"\s+", " ", raw)
        if not text:
            continue
        if runs and runs[-1][1] == font and runs[-1][2] == size:
            runs[-1][0] += text
            runs[-1][3] = runs[-1][3] | bb
            runs[-1][4] += raw
        else:
            runs.append([text, font, size, fitz.Rect(bb), raw])
    for i in range(1, len(runs)):  # one space between pieces, not two
        if runs[i - 1][0].endswith(" ") and runs[i][0].startswith(" "):
            runs[i][0] = runs[i][0][1:]
            runs[i][4] = runs[i][4].lstrip(" ")
    if runs:
        runs[0][0], runs[0][4] = runs[0][0].lstrip(), runs[0][4].lstrip()
        runs[-1][0], runs[-1][4] = runs[-1][0].rstrip(), runs[-1][4].rstrip()
    return [r for r in runs if r[0]]


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
            # headline-size lines are placed one element per printed line, so
            # each fills exactly its printed width (no stretched word gaps)
            if l.get("solo") or last.get("solo") or l["size"] >= DISPLAY:
                continue
            if same_style and same_col and -2 < gap < 0.9 * l["size"]:
                home = b
                break
        if home is None:
            blocks.append([l])
        else:
            home.append(l)
    return blocks


# ------------------------------------------------------------- measuring ---

def is_light(color):
    """White or pale text (e.g. on a black label)."""
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    return 0.299 * r + 0.587 * g + 0.114 * b > 150


def ink_height(img, light=False):
    px = img.load()
    hit = (lambda v: v > 115) if light else (lambda v: v < 140)
    rows = [y for y in range(img.height) if any(hit(px[x, y]) for x in range(0, img.width, 2))]
    return (rows[-1] - rows[0] + 1) if rows else 0


def matched_size(page, line):
    """Font size (pt) at which our face's letters are as tall as the printed
    ones for this exact text."""
    pix = page.get_pixmap(dpi=300, clip=line["bbox"], colorspace=fitz.csGRAY)
    # white text on a dark box: its ink is the light pixels, not the box
    h_src = ink_height(Image.frombytes("L", (pix.width, pix.height), pix.samples), is_light(line["color"])) * 72 / 300
    bb = pil_font(line["font"]).getbbox(line["text"])
    h_100 = bb[3] - bb[1]
    if not h_src or not h_100:
        return line["size"] * 0.75
    return 100 * h_src / h_100


@lru_cache(maxsize=8)
def ink_mask(doc_path, pno):
    """Source page `pno` (0-based) as a 300 DPI ink mask."""
    import numpy as np
    pix = fitz.open(doc_path)[pno].get_pixmap(dpi=300, colorspace=fitz.csGRAY)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width) < 128


def source_ink_x(page, line):
    """Left and right edge (pt) of a printed line's ink."""
    import numpy as np
    mask = ink_mask(SRC, page.number)
    k = 300 / 72
    b, y, sz = line["bbox"], line["origin_y"], line["size"]
    x0, x1 = int((b.x0 - 3) * k), int((b.x1 + 3) * k) + 1
    if is_light(line["color"]):
        # white on dark: the ink is what isn't dark, inside the line's own box
        mask = ~mask
        x0, x1 = int(b.x0 * k), int(b.x1 * k) + 1
    y0, y1 = int((y - 0.6 * sz) * k), int((y + 0.1 * sz) * k) + 1
    cols = np.nonzero(mask[max(0, y0):y1, max(0, x0):x1].any(axis=0))[0]
    if not len(cols):
        return b.x0, b.x1
    return (max(0, x0) + cols[0]) / k, (max(0, x0) + cols[-1] + 1) / k


def shown(run, line):
    """A run's text as it goes to its font: the paper's own glyph codes for a
    line set in the paper's own font (--gopika), Unicode otherwise."""
    return run[4] if line.get("exact") and run[1] is None else run[0]


def bearings(line, fid, size, hscale):
    """(left, right) gap (pt) between our line's advance box and its ink."""
    runs = [r for r in line["runs"] if r[0].strip()]
    first, last = runs[0], runs[-1]
    f0, s0 = first[1] or fid, first[2] or size
    f1, s1 = last[1] or fid, last[2] or size
    left = pil_font(f0).getbbox(shown(first, line).lstrip())[0] / 100 * s0 * hscale
    t = shown(last, line).rstrip()
    right = (pil_font(f1).getlength(t) - pil_font(f1).getbbox(t)[2]) / 100 * s1 * hscale
    return left, right


def ink_width(line, fid, size):
    """Width (pt) of our line's ink at hScale 1, set on one line."""
    left, right = bearings(line, fid, size, 1)
    return line_width(line, fid, size, 1) - left - right


def line_width(line, fid, size, hscale):
    """Natural width (pt) of one printed line set in our faces: the element's
    font for unstyled runs, each styled run in its own face and size."""
    w = 0.0
    for r in line["runs"]:
        text, font, rsize = shown(r, line), r[1], r[2]
        w += width100(font or fid, text) * (rsize or size) / 100
    return w * hscale


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
    return {"x": round(rect.x0 * PX, 2), "y": round(rect.y0 * PX, 3),
            "width": round(rect.width * PX, 2), "height": round(rect.height * PX, 2)}


def block_rect(lines):
    rect = fitz.Rect(lines[0]["bbox"])
    for l in lines[1:]:
        rect |= l["bbox"]
    return rect


def paragraphs(lines, rect):
    """A first-line indent, or a line stopping well short, starts a paragraph."""
    paras, cur, prev_short = [], [], False
    for l in lines:
        if cur and (l["bbox"].x0 - rect.x0 > 4 or prev_short):
            paras.append(cur)
            cur = []
        cur.append(l)
        prev_short = rect.x1 - l["bbox"].x1 > 18
    paras.append(cur)
    return paras


def split_by_indent(block):
    """One element can indent its paragraphs only alike, so a block whose
    paragraphs start differently -- a column continuing a paragraph from the
    one before (no indent), a dateline set to the right ("આબુ રોડ") -- is cut
    where the first-line indent changes."""
    lines = sorted(block, key=lambda l: l["bbox"].y0)
    rect = block_rect(lines)
    groups = []
    for p in paragraphs(lines, rect):
        ind = round(p[0]["bbox"].x0 - rect.x0)
        if groups and abs(groups[-1][0] - ind) <= 2:
            groups[-1][1].extend(p)
        else:
            groups.append([ind, list(p)])
    return [g[1] for g in groups]


def text_element(page, block, eid, aid):
    """One printed text block as one element per printed line -- the most
    exact thing a backend can send. Each line sits at its own printed
    baseline (line_top) and is exactly its printed width, filled edge to
    edge ("justify-all"), so both edges and the baseline match the print
    whatever the substitute face's widths and heights. All lines of a block
    share one size and one horizontal scale, so the letters look alike."""
    lines = sorted(block, key=lambda l: l["bbox"].y0)
    fid = lines[0]["font"]
    origins = [l["origin_y"] for l in lines]
    pitch = (statistics.median([b - a for a, b in zip(origins, origins[1:])]) if len(lines) > 1
             else lines[0]["bbox"].height * 1.05)
    exact = all(l.get("exact") for l in lines)
    if exact:
        # the paper's own font: its printed size and width, nothing to match
        size, hscale = max(l["size"] for l in lines), 1.0
    else:
        # Tinos / Liberation Serif have Times's metrics: English keeps its printed
        # size; a Gujarati face is sized to match the printed letters' height
        size = (max(l["size"] for l in lines) if fid in LATIN
                else matched_size(page, max(lines, key=lambda l: len(l["text"]))))
        # one glyph scale at which every line fits its own printed width
        natural = [max(line_width(l, fid, size, 1), 1e-6) for l in lines]
        hscale = min(l["bbox"].width / n for l, n in zip(lines, natural)) * 0.99
        # the source's display faces (Maruti, TitleTwo) are condensed; ours aren't
        floor = 0.45 if lines[0]["size"] >= DISPLAY else 0.6
        hscale = round(max(floor, min(1.3 if lines[0]["size"] >= DISPLAY else 1.15, hscale)), 3)
    out = []
    for j, l in enumerate(lines):
        runs = tidy_joined([[shown(r, l), r[1], r[2]] for r in l["runs"]])
        if all(f is None for _, f, _ in runs):
            text = "".join(t for t, _, _ in runs)
        else:
            text = [{"text": t, **({"font": f} if f else {}), **({"size": round(z * PX, 2)} if z else {})}
                    for t, f, z in runs]
        top = line_top(fid, size * PX, pitch * PX, l["origin_y"]) / PX
        # the box is placed so our INK lands on the printed ink: the two
        # faces sit their letters differently inside their advance widths,
        # which shows at headline sizes. A line with no space to stretch
        # gets its own scale so its ink is as wide as printed.
        ink0, ink1 = source_ink_x(page, l)
        hs = hscale
        if " " not in l["text"].strip() and not exact:
            # a hair under the printed width: a word set in a box exactly its
            # own width can break across lines on a rounding error
            hs = round(max(0.45, min(1.3, 0.997 * (ink1 - ink0) / max(ink_width(l, fid, size), 1e-6))), 3)
        left, right = bearings(l, fid, size, hs)
        el = {"id": f"{eid}-l{j}", "kind": "text",
              **box(fitz.Rect(ink0 - left, top, ink1 + right, top + pitch)),
              "text": text, "font": fid, "size": round(size * PX, 2), "lineHeight": round(pitch * PX, 2),
              "color": l["color"], "align": "justify-all"}
        if hs != 1.0:
            el["hScale"] = hs
        if exact:
            el["plainText"] = l["text"]
        if aid:
            el["articleId"] = aid
        # kept while fitting and calibrating, removed before writing
        el["_baseline"], el["_ink"], el["_size"] = l["origin_y"], (ink0, ink1), l["size"]
        el["_single"] = " " not in l["text"].strip() and not exact
        # a one-word line set in the paper's own font: the layout software
        # spread its letters to the column edge, so letter spacing matches it
        if exact and " " not in l["text"].strip():
            el["_track"] = max(1, len("".join(t for t, _, _ in runs)) - 1)
        out.append(el)
    return out


def tidy_joined(runs):
    out = []
    for r in runs:
        if out and out[-1][1] == r[1] and out[-1][2] == r[2]:
            out[-1][0] += r[0]
        else:
            out.append(r)
    return out


def hexrgb(c):
    return "#%02x%02x%02x" % tuple(int(v * 255) for v in c)


def path_data(items, closed):
    """PyMuPDF drawing items -> absolute SVG path data in contract px."""
    f = lambda p: f"{p.x * PX:.1f} {p.y * PX:.1f}"  # noqa: E731
    out, at = [], None
    for it in items:
        kind, pts = it[0], it[1:]
        if kind == "re":
            r = pts[0]
            out.append(f"M{f(r.tl)} L{f(r.tr)} L{f(r.br)} L{f(r.bl)} Z")
            at = None
            continue
        if kind == "qu":
            q = pts[0]
            out.append(f"M{f(q.ul)} L{f(q.ur)} L{f(q.lr)} L{f(q.ll)} Z")
            at = None
            continue
        start = pts[0]
        if at is None or abs(at.x - start.x) > 0.01 or abs(at.y - start.y) > 0.01:
            out.append(f"M{f(start)}")
        if kind == "l":
            out.append(f"L{f(pts[1])}")
            at = pts[1]
        elif kind == "c":
            out.append(f"C{f(pts[1])} {f(pts[2])} {f(pts[3])}")
            at = pts[3]
    if closed:
        out.append("Z")
    return " ".join(out)


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
        elif r.width > 2 and r.height > 2 and any(it[0] in ("c", "qu") for it in items):
            # curved shapes (e.g. the black rounded "તંત્રી સ્થાનેથી" label
            # behind white text) exactly as drawn, as a path
            el = {"id": f"{prefix}-shape{i}", "kind": "path", "d": path_data(items, d.get("closePath")),
                  **({"articleId": aid} if aid else {})}
            if d.get("fill"):
                el["fill"] = hexrgb(d["fill"])
            if d.get("color") and d.get("width"):
                el["stroke"] = hexrgb(d["color"])
                el["strokeWidth"] = round(d["width"] * PX, 2)
            if "fill" in el or "stroke" in el:
                out.append(el)
        elif r.width > 2 and r.height > 2 and (d.get("fill") or all(it[0] == "re" for it in items)):
            el = {"id": f"{prefix}-box{i}", "kind": "rect", **box(r), **({"articleId": aid} if aid else {})}
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
        parts = [part for blk in blocks_of(text_lines) for part in split_by_indent(blk)]
        for k, part in enumerate(parts):
            texts += text_element(page, part, f"{aid}-t{k}", aid)

    # rules and boxes drawn between stories (page dividers), not inside any
    # one article's region
    regions = [fitz.Rect(a[3]) for a in ARTICLES if a[1] == pno]
    seen = {e["id"].rsplit("-", 1)[-1] for e in shapes}
    for e in drawing_elements(page, fitz.Rect(0, top, W, bottom), regions, f"p{pno}", None):
        if e["id"].rsplit("-", 1)[-1] not in seen:
            shapes.append(e)

    missing = [l for l in lines if "claimed" not in l]
    if missing:
        sys.exit(f"page {pno}: {len(missing)} source line(s) not in any element, e.g. {missing[0]['text'][:40]!r}")
    return {"number": pno, "width": round(W * PX, 2), "height": round(H * PX, 2),
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
    shrunk = {}
    for n in range(passes):
        warnings = measure(issue)
        over = [w for w in warnings if w["kind"] == "text-overflow"]
        touch = [w for w in warnings if w["kind"] == "overlap"]
        if not over and not touch:
            print(f"fit: no text overflows or overlaps after {n} pass(es)")
            return []
        # letters running into a neighbour (our faces' marks reach further
        # than Bharati's): set the lines involved 2% smaller, at most 10%,
        # keeping their baselines and their printed width
        for w in touch:
            other = w["detail"].rsplit(" ", 1)[-1]
            for eid in (w["elementId"], other):
                el = by_id.get(eid)
                if not el or el["kind"] != "text" or shrunk.get(eid, 0) >= 5:
                    continue
                shrunk[eid] = shrunk.get(eid, 0) + 1
                el["size"] = round(el["size"] * 0.98, 2)
                if "_baseline" in el:
                    el["y"] = round(line_top(el["font"], el["size"], el["lineHeight"], el["_baseline"]), 3)
        for w in over:
            el = by_id[w["elementId"]]
            hs = el.get("hScale", 1.0)
            # a whole extra line needs a real squeeze; a sliver needs a nudge
            step = 0.05 if w["amount"] >= 0.5 * el["lineHeight"] else 0.01
            if hs - step >= 0.45:
                el["hScale"] = round(hs - step, 3)
            else:
                el["size"] = round(el["size"] * 0.96, 2)
                if "_baseline" in el:  # a smaller size sits differently in its line: keep the baseline
                    el["y"] = round(line_top(el["font"], el["size"], el["lineHeight"], el["_baseline"]), 3)
    left = [w for w in measure(issue) if w["kind"] in ("text-overflow", "overlap")]
    print(f"fit: {len(left)} overflow/overlap warning(s) left after {passes} passes")
    for w in left:
        print(f"   {w['elementId']}: {w['kind']} {w['detail']}")
    return left


def calibrate_ink(issue, rounds=2):
    """Close the loop on horizontal placement: print the issue with the
    frontend's own printer, find where each line's ink actually landed, and
    move the line by the difference from the printed ink -- no prediction of
    the faces' side bearings can beat measuring the real result."""
    import numpy as np
    k = 300 / 72
    for n in range(rounds):
        with tempfile.TemporaryDirectory() as tmp:
            src, out = os.path.join(tmp, "issue.json"), os.path.join(tmp, "issue.pdf")
            json.dump(issue, open(src, "w"), ensure_ascii=False)
            subprocess.run(["node", "--experimental-strip-types", "--no-warnings",
                            os.path.join(HERE, "print-issue.mts"), src, out], check=True, capture_output=True)
            pdf = fitz.open(out)
            moved = worst = 0.0
            count = 0
            for page in issue["pages"]:
                pix = pdf[page["number"] - 1].get_pixmap(dpi=300, colorspace=fitz.csGRAY)
                mask = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width) < 128
                for el in page["elements"]:
                    if "_ink" not in el:
                        continue
                    s0, s1 = el["_ink"]
                    ex0, ex1 = el["x"] / PX, (el["x"] + el["width"]) / PX
                    y, sz = el["_baseline"], el["_size"]
                    # only around the printed line: a wider band catches the
                    # ink of a neighbouring piece on the same baseline
                    x0, x1 = int((s0 - 2) * k), int((s1 + 2) * k) + 1
                    m = mask
                    if is_light(el.get("color", "#000000")):
                        m, x0, x1 = ~mask, int(s0 * k), int(s1 * k) + 1
                    y0, y1 = int((y - 0.6 * sz) * k), int((y + 0.1 * sz) * k) + 1
                    cols = np.nonzero(m[max(0, y0):y1, max(0, x0):x1].any(axis=0))[0]
                    if not len(cols):
                        continue
                    o0, o1 = (max(0, x0) + cols[0]) / k, (max(0, x0) + cols[-1] + 1) / k
                    d0, d1 = s0 - o0, s1 - o1
                    worst = max(worst, abs(d0), abs(d1))
                    if max(abs(d0), abs(d1)) < 0.2:
                        continue
                    count += 1
                    el["x"] = round(el["x"] + d0 * PX, 2)
                    if el.get("_track"):
                        # spread (or tighten) the letters by the width still missing
                        spread = (s1 - s0) - (o1 - o0)
                        el["letterSpacing"] = round(el.get("letterSpacing", 0) + spread / el["_track"] * PX, 3)
                        el["width"] = round(el["width"] + spread * PX + abs(spread) * PX, 2)
                    elif el["_single"]:
                        # one word doesn't stretch: scale it to the printed width
                        el["hScale"] = round(el.get("hScale", 1.0) * (s1 - s0) / max(o1 - o0, 1e-6), 4)
                        el["width"] = round(el["width"] * (s1 - s0) / max(o1 - o0, 1e-6), 2)
                    else:
                        el["width"] = round(el["width"] + (d1 - d0) * PX, 2)
                    moved = max(moved, abs(d0), abs(d1))
            print(f"calibrate {n + 1}: {count} line(s) moved, worst ink offset {worst:.2f}pt before moving")


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
    calibrate_ink(issue, rounds=3)
    fit_in_chromium(issue)
    for p in issue["pages"]:
        for e in p["elements"]:
            for k in ("_baseline", "_ink", "_size", "_single", "_track"):
                e.pop(k, None)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(issue, open(OUT, "w"), ensure_ascii=False)
    kinds = {}
    for e in (e for p in pages for e in p["elements"]):
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    print(f"wrote {OUT}: {len(pages)} pages, {len(ids)} elements {kinds}, "
          f"{os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
