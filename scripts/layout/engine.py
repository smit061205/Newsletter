#!/usr/bin/env python3
"""The one layout engine behind both the website and the print PDF.

Input is the backend contract exactly as agreed (web/src/lib/contract.ts):
one pixel-precise box per article at 300 DPI on the (196) page, plus
type/title/kicker/bodyText/photoUrl/photoCaption. No layout hints. Everything
inside a box -- column grid, kicker and headline size, photo position, how
the body threads through the columns, leading -- is decided here, fluidly,
for whatever box the backend sends.

Output is a *resolved* layout: every visible line as its own absolutely
positioned element with a fixed rect, font, size and exact text. That one
resolved layout is serialized to HTML twice (web mode, pdf mode) that differ
only in how static chrome art is supplied, so the website and the PDF draw
the same lines in the same places and cannot drift apart.

Measurements that drive the numbers below (all taken off the real source,
"(196) Capital Kranti_08 august.pdf"):
  - body text is 13pt declared (BBharatiGopikaTwo) on every page, and the
    line pitch is exactly 15.6pt = 1.2 x the DECLARED size -- not 1.2 x the
    calibrated substitute size, which is ~9.7pt Hind Vadodara;
  - body columns sit on an 8-column grid: 136.084pt pitch, 11.884pt gutter,
    124.2pt column width (capital_kranti_grid_spec.json);
  - headlines run 22-60pt declared, mostly BBharatiGopikaTwo,Bold.
Declared sizes are converted to the substitute fonts through
calibration_ratios.json (layout_lib.calibration_ratio), never guessed.

Usage:
  engine.py --url http://localhost:3000/api/issue --out-dir out/engine
  engine.py --issue-json path/to/issue.json --pdf out/issue.pdf
"""
import argparse
import datetime
import hashlib
import html as htmllib
import json
import math
import os
import re
import sys
import urllib.request
from functools import lru_cache

import fitz
from PIL import Image
from weasyprint import HTML
from weasyprint.formatting_structure import boxes

SCRIPTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SCRIPTS)
from layout_lib import calibration_ratio  # noqa: E402

ROOT = os.path.dirname(SCRIPTS)
PUBLIC = os.path.join(ROOT, "web", "public")
SRC_PDF = os.path.join(ROOT, "(196) Capital Kranti_08 august.pdf")
CACHE_DIR = os.path.join(ROOT, "out", ".cache")

PT_PER_PX = 0.24  # 72 / 300, the contract's DPI
PAGE_W, PAGE_H = 1105.5, 1488.2
GRID_PITCH = 136.084
GUTTER = 11.884
CSS_PX_PER_PT = 96 / 72  # WeasyPrint's internal unit is the CSS px

BODY_DECLARED = 13.0
BODY_LEADING = 1.2  # x declared size, measured (15.6pt pitch)
INK = "rgb(35,31,32)"

# One CSS family per font FILE (not per weight) so matching can never fall
# through to a different face in either the browser or WeasyPrint.
ROLES = {
    "body": {"src": "BBharatiGopikaTwo", "family": "CKBody", "file": "fonts/HindVadodara-Regular.ttf"},
    "bold": {"src": "BBharatiGopikaTwo,Bold", "family": "CKBold", "file": "fonts/HindVadodara-Bold.ttf"},
    "head": {"src": "BBharatiMaruti", "family": "CKHead", "file": "fonts/MuktaVaani-Bold.ttf"},
}
FONT_FACES = "".join(
    f"@font-face{{font-family:{r['family']};src:url({r['file']})}}" for r in ROLES.values()
)

HEADER_SPEC = json.load(open(os.path.join(ROOT, "web", "src", "lib", "header_spec.json")))
RAW196 = HEADER_SPEC["header_boxes_raw196_pt"]
COLORS = HEADER_SPEC["colors"]
RUNNING = json.load(open(os.path.join(SCRIPTS, "data", "running_header_geometry.json")))
FOOTER_CLIP = (12.0, 1455.0, 1093.0, 1473.5)  # outlined legal line, source page 4

GUJ_DIGITS = "૦૧૨૩૪૫૬૭૮૯"
GUJ_DAYS = ["સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર", "રવિવાર"]


def guj(s):
    return "".join(GUJ_DIGITS[int(c)] if c.isdigit() else c for c in str(s))


def size_for(role, declared):
    """Substitute-font point size for a declared (source-font) size."""
    return round(declared * calibration_ratio(ROLES[role]["src"], declared), 3)


def esc(s):
    return htmllib.escape(s, quote=True)


# ---------------------------------------------------------------- lines ----

@lru_cache(maxsize=8192)
def set_lines(paras, width_pt, role, declared):
    """Greedy line breaking of `paras` (tuple of strings) at `width_pt`,
    done by WeasyPrint itself so the breaks are exactly the ones the print
    engine would make. Returns a tuple of (para_index, text, is_para_end).
    Line pitch plays no part in where lines break, so callers can try many
    leadings against one result."""
    if not paras:
        return ()
    fam = ROLES[role]["family"]
    size = size_for(role, declared)
    body = "".join(f"<p>{esc(p)}</p>" for p in paras)
    doc = HTML(
        string=(
            f"<html><head><meta charset='utf-8'><style>{FONT_FACES}"
            f"@page{{size:{width_pt:.3f}pt 14000pt;margin:0}}"
            f"body{{margin:0;font-family:{fam};font-size:{size}pt;line-height:1}}"
            f"p{{margin:0}}</style></head><body>{body}</body></html>"
        ),
        base_url=PUBLIC + "/",
    ).render()

    elem_index = {}
    raw = []  # (para_idx, text)

    def walk(box):
        if isinstance(box, boxes.LineBox):
            owner = box.element
            idx = elem_index.setdefault(id(owner), len(elem_index))
            text = "".join(t.text for t in box.descendants() if isinstance(t, boxes.TextBox))
            raw.append((idx, text.strip()))
            return
        for child in getattr(box, "children", None) or []:
            walk(child)

    for page in doc.pages:
        walk(page._page_box)

    out = []
    for i, (p, text) in enumerate(raw):
        last = i == len(raw) - 1 or raw[i + 1][0] != p
        out.append((p, text, last))
    return tuple(out)



# --------------------------------------------------------------- photos ----

def resolve_image(url):
    """Returns (local_path, web_src) for a photoUrl, or (None, None)."""
    if not url:
        return None, None
    if url.startswith("http://") or url.startswith("https://"):
        os.makedirs(os.path.join(CACHE_DIR, "img"), exist_ok=True)
        ext = os.path.splitext(url.split("?")[0])[1] or ".jpg"
        local = os.path.join(CACHE_DIR, "img", hashlib.sha1(url.encode()).hexdigest() + ext)
        if not os.path.exists(local):
            urllib.request.urlretrieve(url, local)
        return local, url
    rel = url.lstrip("/")
    local = os.path.join(PUBLIC, rel)
    return (local, rel) if os.path.exists(local) else (None, None)


@lru_cache(maxsize=512)
def image_aspect(local):
    with Image.open(local) as im:
        w, h = im.size
    return w / h


# ------------------------------------------------------------- articles ----

class Box:
    __slots__ = ("kind", "x", "y", "w", "h", "role", "size", "pitch", "text", "justify", "src", "fit", "local", "color", "bg", "align")

    def __init__(self, kind, x, y, w, h, **kw):
        self.kind, self.x, self.y, self.w, self.h = kind, x, y, w, h
        for k in self.__slots__[5:]:
            setattr(self, k, kw.get(k))

    def to_json(self):
        d = {k: getattr(self, k) for k in self.__slots__ if getattr(self, k) is not None}
        for k in ("x", "y", "w", "h"):
            d[k] = round(d[k], 2)
        return d


def text_lines(lines, x, y, w, role, declared, pitch, justify=False):
    """Boxes for already-broken lines stacked from (x, y). Only body copy is
    justified (and never a paragraph's last line) -- justifying a two-word
    headline line spreads it into huge gaps, which the real paper never does."""
    size = size_for(role, declared)
    out = []
    for j, (_, text, para_end) in enumerate(lines):
        out.append(Box("line", x, y + j * pitch, w, pitch, role=role, size=size, pitch=pitch,
                       text=text, justify=justify and not para_end))
    return out


def headline_cap(cols):
    return {1: 24, 2: 30, 3: 38, 4: 46}.get(cols, 60)


def split_paragraphs(text):
    paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", text or "")]
    return tuple(p for p in paras if p)


def layout_ad(a, x, y, w, h, warnings):
    local, src = resolve_image(a.get("photoUrl", ""))
    if not local:
        if a.get("photoUrl"):
            warnings.append({"id": a["id"], "kind": "missing-image", "detail": a["photoUrl"]})
        return [Box("placeholder", x, y, w, h, text="ADVERTISEMENT")]
    ia, ba = image_aspect(local), w / h
    crop = 1 - min(ia / ba, ba / ia)
    fit = "cover" if crop <= 0.35 else "contain"
    return [Box("img", x, y, w, h, src=src, local=local, fit=fit)]


def body_fit(n_lines_by_decl, frames):
    """Pick (declared, leading) for the body. Prefers the real paper's
    13pt / 1.2; on overflow tightens leading to 1.15 then steps the size
    down; on underflow loosens leading up to 1.28 to fill the box. Returns
    (declared, pitch, fits)."""
    heights = [f[3] for f in frames]

    def capacity(pitch):
        return sum(int((h + 0.01) // pitch) for h in heights)

    for declared in (13.0, 12.5, 12.0):
        n = n_lines_by_decl(declared)
        base = declared * BODY_LEADING
        if n <= capacity(base):
            best = base
            for lead in (1.21, 1.22, 1.23, 1.24, 1.25, 1.26, 1.27, 1.28):
                if n <= capacity(declared * lead):
                    best = declared * lead
            return declared, best, True
        for lead in (1.19, 1.18, 1.17, 1.16, 1.15):
            if n <= capacity(declared * lead):
                return declared, declared * lead, True
    return 12.0, 12.0 * 1.15, False


def balanced_caps(frames, pitch, n):
    """Per-frame line counts that end every column on the same baseline
    when the text is shorter than the box (how a newspaper sets a short
    story), falling back to plain top-to-bottom filling otherwise."""
    tops = [f[1] for f in frames]
    bottoms = [f[1] + f[3] for f in frames]

    def caps_at(limit):
        return [max(0, int((min(limit, b) - t + 0.01) // pitch)) for t, b in zip(tops, bottoms)]

    lo, hi = min(tops), max(bottoms)
    if sum(caps_at(hi)) < n:
        return caps_at(hi)
    for _ in range(40):
        mid = (lo + hi) / 2
        if sum(caps_at(mid)) >= n:
            hi = mid
        else:
            lo = mid
    return caps_at(hi)


def layout_story(a, x, y, w, h, warnings):
    cols = max(1, round((w + GUTTER) / GRID_PITCH))
    colw = (w - (cols - 1) * GUTTER) / cols
    paras = split_paragraphs(a.get("bodyText", ""))
    local, src = resolve_image(a.get("photoUrl", ""))
    if a.get("photoUrl") and not local:
        warnings.append({"id": a["id"], "kind": "missing-image", "detail": a["photoUrl"]})

    result = None
    for step in range(4):  # each step gives the body a little more room
        out, cursor = [], y

        kicker = (a.get("kicker") or "").strip()
        if kicker:
            kd = 18.0 if cols > 1 else 15.0
            klines = set_lines((kicker,), w, "bold", kd)
            while len(klines) > 2 and kd > 13:
                kd -= 1
                klines = set_lines((kicker,), w, "bold", kd)
            kp = kd * 1.2
            out += text_lines(klines, x, cursor, w, "bold", kd, kp)
            cursor += len(klines) * kp + 2

        title = (a.get("title") or "").strip()
        if title:
            max_lines = 3 if cols == 1 else 2
            hd = headline_cap(cols) - 4 * step
            tl = set_lines((title,), w, "bold", hd)
            while len(tl) > max_lines and hd > 16:
                hd -= 1
                tl = set_lines((title,), w, "bold", hd)
            hp = hd * 1.2  # measured: Gopika Bold headlines sit on 1.2 x declared, like body
            out += text_lines(tl, x, cursor, w, "bold", hd, hp)
            cursor += len(tl) * hp + 6

        k = 0
        photo_bottom = cursor
        if local and (y + h - cursor) > 60:
            k = cols if cols <= 1 else (cols - 1 if cols <= 3 else math.ceil(cols / 2))
            if not paras:
                k = cols
            pw = k * colw + (k - 1) * GUTTER
            ph = pw / image_aspect(local)
            cap = (y + h - cursor) * ((0.45, 0.40, 0.34, 0.28)[step] if paras else 1.0)
            ph = min(ph, cap)
            px = x + w - pw
            out.append(Box("img", px, cursor, pw, ph, src=src, local=local, fit="cover"))
            photo_bottom = cursor + ph + 3
            caption = (a.get("photoCaption") or "").strip()
            if caption:
                cd = 11.0
                cl = set_lines((caption,), pw, "bold", cd)
                cp = cd * 1.2
                out += text_lines(cl, px, photo_bottom, pw, "bold", cd, cp)
                photo_bottom += len(cl) * cp
            photo_bottom += 5

        frames = []
        for i in range(cols):
            fx = x + i * (colw + GUTTER)
            fy = photo_bottom if (k and i >= cols - k) else cursor
            frames.append((fx, fy, colw, max(0.0, y + h - fy)))

        if not paras:
            result = (out, None)
            break

        declared, pitch, fits = body_fit(lambda d: len(set_lines(paras, colw, "body", d)), frames)
        if fits or step == 3:
            result = (out, (declared, pitch, frames, fits))
            break

    out, body = result
    if body is None:
        return out
    declared, pitch, frames, fits = body
    lines = set_lines(paras, colw, "body", declared)
    caps = balanced_caps(frames, pitch, len(lines))
    i = 0
    for (fx, fy, fw, fh), cap in zip(frames, caps):
        take = lines[i:i + cap]
        out += text_lines(take, fx, fy, fw, "body", declared, pitch, justify=True)
        i += len(take)
    if i < len(lines):
        warnings.append({"id": a["id"], "kind": "overflow",
                         "detail": f"{len(lines) - i} line(s) did not fit",
                         "leftover": " ".join(t for (_, t, _) in lines[i:])})
    capacity = sum(f[3] for f in frames)
    fill = (min(i, len(lines)) * pitch) / capacity if capacity else 1.0
    if fill < 0.92 and fits:
        warnings.append({"id": a["id"], "kind": "underflow", "detail": f"body fills {fill:.0%} of its columns"})
    return out


def layout_article(a, warnings, safe=(0.0, PAGE_H)):
    """Lays out one article inside its backend box. `safe` is the vertical
    band the page's own chrome leaves free (below the masthead / running
    header, above the footer); a box reaching into the chrome is clamped
    back into that band and flagged, never drawn over the header."""
    x, y = a["x"] * PT_PER_PX, a["y"] * PT_PER_PX
    w, h = a["width"] * PT_PER_PX, a["height"] * PT_PER_PX
    top, bottom = max(y, safe[0]), min(y + h, safe[1])
    if (top, bottom) != (y, y + h):
        warnings.append({"id": a["id"], "kind": "chrome-overlap",
                         "detail": f"box trimmed by {top - y + (y + h - bottom):.1f}pt to clear the page header/footer"})
        y, h = top, max(0.0, bottom - top)
    if a["type"] == "ad":
        return layout_ad(a, x, y, w, h, warnings)
    return layout_story(a, x, y, w, h, warnings)


# ---------------------------------------------------------------- chrome ----

def chrome_for_page(page_no, total_pages, issue):
    """Static art (vector-copied from the source in the PDF, a 300 DPI
    render of the same clip on the website) plus the dynamic boxes painted
    over it. Returns (statics, boxes, (safe_top, safe_bottom)) -- the band
    the chrome leaves free for articles."""
    statics, out = [], []
    safe_top, safe_bottom = 0.0, PAGE_H
    try:
        d = datetime.date.fromisoformat(issue["issueDate"])
    except ValueError:
        d = None
    if page_no == 1:
        eb = RAW196["edition_bar_bg"]
        statics.append({"name": "masthead", "src_page": 0, "clip": (0.0, 0.0, PAGE_W, eb["y0"])})
        safe_top = eb["y1"] + 1.5
        out += edition_bar(issue, d)
    else:
        g = ((page_no - 2) % 3) + 1  # reuse source pages 2-4's strips cyclically
        geo = RUNNING[str(g)]
        statics.append({"name": f"running-{g}", "src_page": g, "clip": tuple(geo["raw_clip"])})
        safe_top = geo["raw_clip"][3] + 1.5
        fill = "rgb({},{},{})".format(*geo["fill_rgb"])
        by0, by1 = geo["box_y"]
        # folio: erase the source page number, paint this one
        fx0 = geo["raw_clip"][0]
        out.append(Box("rect", fx0, by0, (fx0 + 31.3) - fx0, by1 - by0, bg=fill))
        out.append(Box("label", fx0, by0, 31.3, by1 - by0, role="bold", size=size_for("bold", 19),
                       pitch=by1 - by0, text=guj(page_no), color="#fff", align="center"))
        # date stamp
        ex0, ex1 = geo["erase_x"]
        out.append(Box("rect", ex0, by0, ex1 - ex0, by1 - by0, bg=fill))
        if d:
            label = f"તારીખ : {guj(d.strftime('%d-%m-%Y'))}, {GUJ_DAYS[d.weekday()]}"
            out.append(Box("label", geo["date_origin"][0], by0, ex1 - geo["date_origin"][0], by1 - by0,
                           role="bold", size=size_for("bold", geo["date_size"]), pitch=by1 - by0,
                           text=label, color="#fff"))
    if page_no == total_pages:
        statics.append({"name": "footer", "src_page": 3, "clip": FOOTER_CLIP})
        safe_bottom = FOOTER_CLIP[1]
    return statics, out, (safe_top, safe_bottom)


def edition_bar(issue, d):
    eb, tl, tr = RAW196["edition_bar_bg"], RAW196["edition_tab_left"], RAW196["edition_tab_right"]
    out = [
        Box("rect", eb["x0"], eb["y0"], eb["x1"] - eb["x0"], eb["y1"] - eb["y0"], bg=COLORS["edition_bg_cream"]),
        Box("rect", tl["x0"], tl["y0"], tl["x1"] - tl["x0"], tl["y1"] - tl["y0"], bg=COLORS["edition_tab_cyan"]),
        Box("rect", tr["x0"], tr["y0"], tr["x1"] - tr["x0"], tr["y1"] - tr["y0"], bg=COLORS["edition_tab_cyan"]),
        Box("rect", eb["x0"] - 0.4, eb["y0"] - 1.02, eb["x1"] - eb["x0"] + 0.8, 2.04, bg="rgb(0,174,239)"),
        Box("rect", eb["x0"] - 0.4, eb["y1"] - 1.02, eb["x1"] - eb["x0"] + 0.8, 2.04, bg="rgb(0,174,239)"),
    ]
    date_part = guj(d.strftime("%d-%m-%Y")) + ", " + GUJ_DAYS[d.weekday()] if d else guj(issue["issueDate"])
    parts = [
        f"વર્ષ : {guj(34)}", f"અંક : {guj(issue['issueNumber'])}", f"તારીખ : {date_part}",
        f"કિંમત : {guj(50)} પૈસા", "તંત્રી : પાર્થ એમ. ઠક્કર",
        "બ્યુરો ચીફ : બિજેન કાપડિયા (અમદાવાદ)", "મેનેજિંગ તંત્રી : સુરેશ ચંડી",
    ]
    out.append(Box("editionbar", eb["x0"], eb["y0"], eb["x1"] - eb["x0"], eb["y1"] - eb["y0"],
                   text="\u0001".join(parts)))
    return out


# ------------------------------------------------------------------ HTML ----

def box_html(b, mode):
    pos = f"left:{b.x:.2f}pt;top:{b.y:.2f}pt;width:{b.w:.2f}pt;height:{b.h:.2f}pt"
    if b.kind == "line":
        cls = "ln j" if b.justify else "ln"
        return (f'<div class="{cls}" style="{pos};font-family:{ROLES[b.role]["family"]};'
                f'font-size:{b.size}pt;line-height:{b.pitch:.3f}pt">{esc(b.text)}</div>')
    if b.kind == "label":
        return (f'<div class="lb" style="{pos};font-family:{ROLES[b.role]["family"]};font-size:{b.size}pt;'
                f'line-height:{b.pitch:.3f}pt;color:{b.color};text-align:{b.align or "left"}">{esc(b.text)}</div>')
    if b.kind == "img":
        return f'<img style="{pos};object-fit:{b.fit}" src="{esc(b.src)}" alt="">'
    if b.kind == "rect":
        return f'<div class="bx" style="{pos};background:{b.bg}"></div>'
    if b.kind == "placeholder":
        return f'<div class="ph" style="{pos};line-height:{b.h:.2f}pt">{esc(b.text)}</div>'
    if b.kind == "editionbar":
        parts = b.text.split("\u0001")
        bullet = '<span class="bu">●</span>'
        inner = bullet.replace('class="bu"', 'class="bu lead"') + bullet.join(f"<span>{esc(p)}</span>" for p in parts)
        return (f'<div class="eb" style="{pos};line-height:{b.h:.2f}pt;font-size:{11.9}pt">{inner}</div>')
    raise ValueError(b.kind)


def page_html(page_no, boxes_, statics, mode):
    static_imgs = ""
    if mode == "web":
        for s in statics:
            x0, y0, x1, y1 = s["clip"]
            static_imgs += (f'<img style="left:{x0:.2f}pt;top:{y0:.2f}pt;width:{x1 - x0:.2f}pt;'
                            f'height:{y1 - y0:.2f}pt" src="chrome/{s["name"]}.png" alt="">')
    base = '<base href="/">' if mode == "web" else ""
    bg = "#fff" if mode == "web" else "transparent"
    body = "".join(box_html(b, mode) for b in boxes_)
    return (
        f"<!doctype html><html><head><meta charset='utf-8'>{base}<title>Page {page_no}</title><style>"
        f"{FONT_FACES}@page{{size:{PAGE_W}pt {PAGE_H}pt;margin:0}}"
        f"html,body{{margin:0;padding:0}}"
        f".pg{{position:relative;width:{PAGE_W}pt;height:{PAGE_H}pt;overflow:hidden;background:{bg};color:{INK}}}"
        f".pg>*{{position:absolute;margin:0;box-sizing:border-box}}"
        f".ln{{white-space:nowrap;text-align:left;overflow:visible}}"
        f".ln.j{{text-align:justify;text-align-last:justify}}"
        f".lb{{white-space:nowrap;overflow:visible}}"
        f".ph{{border:0.75pt dashed #aaa;color:#999;text-align:center;font:9pt Helvetica,Arial,sans-serif;letter-spacing:1pt}}"
        f".eb{{white-space:nowrap;text-align:center;font-family:CKBold;color:{INK}}}"
        f".eb .bu{{color:{COLORS['bullet_gold']};font-size:13.6pt;padding:0 7.57pt 0 14.6pt}}"
        f".eb .bu.lead{{padding-left:0}}"
        f"</style></head><body><div class='pg'>{static_imgs}{body}</div></body></html>"
    )


# ------------------------------------------------------------- pipeline ----

def ensure_chrome_assets(statics):
    os.makedirs(os.path.join(PUBLIC, "chrome"), exist_ok=True)
    src = None
    for s in statics:
        path = os.path.join(PUBLIC, "chrome", f"{s['name']}.png")
        if os.path.exists(path):
            continue
        src = src or fitz.open(SRC_PDF)
        pix = src[s["src_page"]].get_pixmap(dpi=300, clip=fitz.Rect(*s["clip"]))
        pix.save(path)


def engine_fingerprint():
    h = hashlib.sha1()
    for p in (__file__, os.path.join(SCRIPTS, "layout_lib.py"),
              os.path.join(ROOT, "web", "src", "lib", "calibration_ratios.json")):
        h.update(open(p, "rb").read())
    return h.hexdigest()[:12]


def resolve_issue(issue, out_root):
    """Lays out every page, writes page-N.{web,pdf}.html + layout.json +
    warnings.json into a cache directory keyed by the issue JSON and the
    engine source. Returns that directory."""
    key = hashlib.sha1((json.dumps(issue, sort_keys=True, ensure_ascii=False) + engine_fingerprint())
                       .encode()).hexdigest()[:16]
    out_dir = os.path.join(out_root, key)
    if os.path.exists(os.path.join(out_dir, "layout.json")):
        return out_dir
    os.makedirs(out_dir, exist_ok=True)
    warnings, pages = [], []
    by_page = {}
    for a in issue["articles"]:
        by_page.setdefault(a["page"], []).append(a)
    for n in range(1, issue["pages"] + 1):
        statics, chrome, safe = chrome_for_page(n, issue["pages"], issue)
        ensure_chrome_assets(statics)
        bxs = list(chrome)
        for a in by_page.get(n, []):
            bxs += layout_article(a, warnings, safe)
        pages.append({"page": n, "statics": statics, "boxes": [b.to_json() for b in bxs]})
        for mode in ("web", "pdf"):
            with open(os.path.join(out_dir, f"page-{n}.{mode}.html"), "w") as f:
                f.write(page_html(n, bxs, statics, mode))
    json.dump(warnings, open(os.path.join(out_dir, "warnings.json"), "w"), ensure_ascii=False, indent=1)
    # layout.json is the cache-hit marker, so it's written last: a concurrent
    # reader that sees it can rely on every other file already being there
    tmp = os.path.join(out_dir, "layout.json.tmp")
    json.dump({"issue": {k: issue[k] for k in ("issueDate", "issueNumber", "pages")}, "pages": pages},
              open(tmp, "w"), ensure_ascii=False)
    os.replace(tmp, os.path.join(out_dir, "layout.json"))
    return out_dir


def compose_pdf(out_dir, out_path):
    layout = json.load(open(os.path.join(out_dir, "layout.json")))
    src = fitz.open(SRC_PDF)
    doc = fitz.open()
    for pg in layout["pages"]:
        n = pg["page"]
        page = doc.new_page(width=PAGE_W, height=PAGE_H)
        for s in pg["statics"]:
            r = fitz.Rect(*s["clip"])
            page.show_pdf_page(r, src, s["src_page"], clip=r)
        pdf_bytes = HTML(filename=os.path.join(out_dir, f"page-{n}.pdf.html"), base_url=PUBLIC + "/").write_pdf()
        layer = fitz.open("pdf", pdf_bytes)
        page.show_pdf_page(page.rect, layer, 0)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    doc.save(out_path, garbage=3, deflate=True)
    return out_path


def load_issue(url=None, path=None):
    if path:
        return json.load(open(path))
    with urllib.request.urlopen(url) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:3000/api/issue")
    ap.add_argument("--issue-json")
    ap.add_argument("--out-dir", default=os.path.join(ROOT, "out", "engine"))
    ap.add_argument("--pdf", help="also compose the print PDF at this path")
    args = ap.parse_args()
    issue = load_issue(args.url, args.issue_json)
    out_dir = resolve_issue(issue, args.out_dir)
    result = {"dir": out_dir, "pages": issue["pages"],
              "warnings": json.load(open(os.path.join(out_dir, "warnings.json")))}
    if args.pdf:
        result["pdf"] = compose_pdf(out_dir, args.pdf)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
