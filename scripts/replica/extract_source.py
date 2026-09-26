#!/usr/bin/env python3
"""Turn the real "(196) Capital Kranti_08 august.pdf" into mock backend data
in the UNCHANGED contract (web/src/lib/contract.ts): one rectangle per
article, type, title/kicker/bodyText, one photoUrl.

How:
  - ARTICLES below lists each real article with a rough rectangle (pt) that
    decides membership only. Every text span, image and ad whose centre
    falls inside it belongs to that article, and the published box is
    snapped to the exact union of those members -- so coordinates come from
    the PDF itself, not from a hand-drawn guess.
  - Text is decoded from the legacy Bharati font (bharati_decode.py) and
    sorted into title (largest headline size), kicker (display text above
    the title), deck (display text below it, kept as the body's opening
    paragraph -- the contract has no deck field) and body (13pt copy in
    column/reading order, paragraphs split at first-line indents).
  - A story that bends around another in print (text running on down one
    column) becomes a main box plus title-less continuation boxes -- the
    contract is rectangles only, so this is exactly how a real backend would
    have to send it.
  - Photos: images inside the article, adjacent ones merged (two photos set
    side by side become one picture), rendered at 200 DPI as printed. Ads:
    the whole ad region rendered as one picture -- exact creative.

Writes web/src/mocks/replica/issue-2026-08-08.json and the images under
web/public/replica/, and prints any text span that no article claimed.
"""
import json
import os
import re
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bharati_decode import decode, is_legacy  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "(196) Capital Kranti_08 august.pdf")
IMG_DIR = os.path.join(ROOT, "web", "public", "replica")
OUT = os.path.join(ROOT, "web", "src", "mocks", "replica", "issue-2026-08-08.json")
PX_PER_PT = 300 / 72

# Chrome bands (already drawn by the frontend): masthead/edition bar on page
# 1, running header on 2+, legal footer on the last page.
CHROME_TOP = {1: 270.0, 2: 43.0, 3: 43.0, 4: 43.0}
CHROME_BOTTOM = {4: 1455.0}

# id, page, type, rough rect (x0, y0, x1, y1) in pt
ARTICLES = [
    # page 1
    ("teachers-portal", 1, "news", (10, 268, 551, 760)),
    ("handloom", 1, "news", (554, 268, 1096, 751)),
    ("handloom-cont", 1, "news", (962, 751, 1096, 1167)),
    ("panchayat-audit", 1, "news", (417, 760, 960, 1167)),
    ("mansa-college", 1, "news", (10, 764, 415, 1472)),
    ("tiranga-gandhinagar", 1, "news", (416, 1167, 1096, 1472)),
    # page 2
    ("narmada-dam", 2, "article", (8, 44, 280, 816)),
    ("mena-atm", 2, "news", (281, 30, 1096, 816)),
    ("mena-atm-cont", 2, "news", (416, 816, 1096, 1175)),
    ("mena-atm-cont2", 2, "news", (416, 1175, 552, 1472)),
    ("ad-ayurveda", 2, "ad", (8, 816, 416, 1472)),
    ("legal-mediation", 2, "news", (552, 1175, 1096, 1476)),
    # page 3
    ("tushar-patel-award", 3, "news", (8, 40, 416, 1002)),
    ("bharuch-sog", 3, "news", (416, 40, 689, 575)),
    ("heart-health", 3, "article", (689, 40, 1096, 575)),
    ("heart-health-cont", 3, "article", (826, 575, 1096, 918)),
    ("sayaji-hospital", 3, "news", (416, 575, 826, 918)),
    ("sayaji-hospital-cont", 3, "news", (416, 918, 692, 1002)),
    ("ad-nature-camp", 3, "ad", (8, 1002, 548, 1472)),
    ("ad-bhagwat", 3, "ad", (548, 1002, 692, 1472)),
    ("ad-business-mela", 3, "ad", (692, 918, 1096, 1472)),
    # page 4
    ("xech-amazon", 4, "news", (8, 30, 552, 660)),
    ("xech-amazon-cont", 4, "news", (8, 660, 146, 1158)),
    ("ad-business-strip", 4, "ad", (552, 42, 1096, 82)),
    ("mp-tourism", 4, "news", (552, 82, 1096, 918)),
    ("rotary", 4, "news", (146, 660, 552, 1158)),
    ("tiranga-traffic", 4, "news", (552, 918, 1096, 1133)),
    ("tiranga-traffic-cont", 4, "news", (552, 1133, 690, 1298)),
    ("tiranga-traffic-cont2", 4, "news", (690, 1133, 826, 1458)),
    ("ad-chardham", 4, "ad", (8, 1158, 552, 1458)),
    ("ad-blood-donation", 4, "ad", (552, 1298, 690, 1458)),
    ("ad-film", 4, "ad", (826, 1133, 1096, 1458)),
]


def inside(rect, bbox):
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    return rect[0] <= cx < rect[2] and rect[1] <= cy < rect[3]


def union(rects):
    xs0, ys0, xs1, ys1 = zip(*rects)
    return [min(xs0), min(ys0), max(xs1), max(ys1)]


def page_lines(page):
    """Every text line on the page: bbox, decoded text, font, size, bold."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = "".join(decode(s["text"])[0] if is_legacy(s["font"]) else s["text"] for s in spans)
            main = max(spans, key=lambda s: len(s["text"].strip()))
            out.append({
                "bbox": list(l["bbox"]), "text": text,
                "size": round(max(s["size"] for s in spans), 1),
                "font": main["font"], "bold": ("Bold" in main["font"] or "Maruti" in main["font"]
                                               or "Title" in main["font"]),
            })
    return out


def photo_rect(page, rough):
    """Largest group of adjacent images inside the article, as one rect."""
    imgs = [fitz.Rect(i["bbox"]) for i in page.get_image_info()
            if inside(rough, i["bbox"]) and i["bbox"][2] - i["bbox"][0] > 40 and i["bbox"][3] - i["bbox"][1] > 40]
    groups = []
    for r in imgs:
        for g in groups:
            touching = any(fitz.Rect(o.x0 - 4, o.y0 - 4, o.x1 + 4, o.y1 + 4).intersects(r) for o in g)
            merged = fitz.Rect(union([tuple(o) for o in g + [r]]))
            # merge only when the combined rectangle is essentially all
            # picture -- two photos offset from each other enclose body text,
            # which would then be baked into the "photo"
            solid = merged.get_area() <= 1.15 * sum(o.get_area() for o in g + [r])
            if touching and solid:
                g.append(r)
                break
        else:
            groups.append([r])
    if not groups:
        return None
    best = max(groups, key=lambda g: fitz.Rect(union([tuple(r) for r in g])).get_area())
    return fitz.Rect(union([tuple(r) for r in best]))


def render(page, rect, name):
    os.makedirs(IMG_DIR, exist_ok=True)
    path = os.path.join(IMG_DIR, name + ".jpg")
    page.get_pixmap(dpi=200, clip=rect).save(path, jpg_quality=88)
    return "/replica/" + name + ".jpg"


def column_order(lines, page_x0=14.0):
    return sorted(lines, key=lambda l: (round((l["bbox"][0] - page_x0) / 136.084), l["bbox"][1]))


def paragraphs(body_lines):
    """Join column lines into paragraphs: a new paragraph starts at a
    first-line indent or after a line that stops well short of its column."""
    paras, cur = [], []
    cols = {}
    for l in body_lines:
        key = round((l["bbox"][0] - 14.0) / 136.084)
        cols.setdefault(key, []).append(l)
    col_x = {k: min(l["bbox"][0] for l in v) for k, v in cols.items()}
    col_r = {k: max(l["bbox"][2] for l in v) for k, v in cols.items()}
    prev_short = False
    for l in body_lines:
        key = round((l["bbox"][0] - 14.0) / 136.084)
        indent = l["bbox"][0] - col_x[key] > 4.0
        if cur and (indent or prev_short):
            paras.append(" ".join(cur))
            cur = []
        cur.append(l["text"].strip())
        prev_short = col_r[key] - l["bbox"][2] > 18.0
    if cur:
        paras.append(" ".join(cur))
    return [re.sub(r"\s+", " ", p).strip() for p in paras if p.strip()]


def build_article(page, lines, art):
    aid, pno, typ, rough = art
    members = [l for l in lines if inside(rough, l["bbox"])]
    for l in members:
        l["claimed"] = aid
    top, bottom = CHROME_TOP.get(pno, 0.0), CHROME_BOTTOM.get(pno, 1e9)

    if typ == "ad":
        rect = fitz.Rect(max(rough[0], 8), max(rough[1], top), rough[2], min(rough[3], bottom))
        # snap to what's actually drawn there
        drawn = [fitz.Rect(i["bbox"]) for i in page.get_image_info() if inside(rough, i["bbox"])]
        drawn += [d["rect"] for d in page.get_drawings() if inside(rough, tuple(d["rect"])) and d["rect"].get_area() > 20]
        drawn += [fitz.Rect(l["bbox"]) for l in members]
        if drawn:
            rect = fitz.Rect(union([tuple(r) for r in drawn])) & rect
        return rect, {"type": "ad", "title": "", "bodyText": "", "photoUrl": render(page, rect, aid)}

    photo = photo_rect(page, rough)
    text_lines = [l for l in members if not (photo and inside(tuple(photo), l["bbox"]))]
    heads = [l for l in text_lines if l["size"] >= 20]
    title_size = max((l["size"] for l in heads), default=None)
    title_lines = [l for l in heads if l["size"] >= title_size * 0.92] if title_size else []
    t_top = min((l["bbox"][1] for l in title_lines), default=1e9)
    display = [l for l in text_lines if l not in title_lines and (l["size"] >= 14.5)]
    kicker_lines = [l for l in display if l["bbox"][3] <= t_top + 3]
    deck_lines = [l for l in display if l not in kicker_lines]
    body_lines = [l for l in text_lines if l not in title_lines and l not in display]

    def join(ls):
        return re.sub(r"\s+", " ", " ".join(l["text"].strip() for l in sorted(ls, key=lambda l: (l["bbox"][1], l["bbox"][0])))).strip()

    paras = [join(deck_lines)] if deck_lines else []
    paras += paragraphs(column_order(body_lines))
    boxes = [tuple(l["bbox"]) for l in members]
    if photo:
        boxes.append(tuple(photo))
    rect = fitz.Rect(union(boxes)) if boxes else fitz.Rect(rough)
    rect = fitz.Rect(rect.x0 - 1, max(rect.y0 - 1, top), rect.x1 + 1, min(rect.y1 + 1, bottom))
    rect &= fitz.Rect(rough)  # never past its own region, so neighbours can't overlap
    data = {
        "type": typ,
        "title": join(title_lines),
        "bodyText": "\n\n".join(p for p in paras if p),
        "photoUrl": render(page, photo, aid) if photo else "",
    }
    kicker = join(kicker_lines)
    if kicker:
        data["kicker"] = kicker
    return rect, data


def main():
    for i, a in enumerate(ARTICLES):
        for b in ARTICLES[i + 1:]:
            if a[1] == b[1] and not (fitz.Rect(a[3]) & fitz.Rect(b[3])).is_empty:
                sys.exit(f"membership rectangles overlap: {a[0]} / {b[0]}")
    doc = fitz.open(SRC)
    articles, unclaimed = [], []
    for pno in range(1, doc.page_count + 1):
        page = doc[pno - 1]
        lines = page_lines(page)
        for art in [a for a in ARTICLES if a[1] == pno]:
            rect, data = build_article(page, lines, art)
            articles.append({
                "id": art[0], "page": pno,
                "x": round(rect.x0 * PX_PER_PT), "y": round(rect.y0 * PX_PER_PT),
                "width": round(rect.width * PX_PER_PT), "height": round(rect.height * PX_PER_PT),
                **data,
            })
        top, bottom = CHROME_TOP.get(pno, 0.0), CHROME_BOTTOM.get(pno, 1e9)
        for l in lines:
            if "claimed" not in l and l["bbox"][1] >= top and l["bbox"][3] <= bottom:
                unclaimed.append((pno, [round(v) for v in l["bbox"]], l["text"][:60]))

    overlaps = []
    for i, a in enumerate(articles):
        ra = fitz.Rect(a["x"], a["y"], a["x"] + a["width"], a["y"] + a["height"])
        for b in articles[i + 1:]:
            if a["page"] != b["page"]:
                continue
            rb = fitz.Rect(b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"])
            inter = ra & rb
            if not inter.is_empty and inter.width > 8 and inter.height > 8:  # px; ignore hairline touches
                overlaps.append((a["page"], a["id"], b["id"], round(inter.width), round(inter.height)))
    if overlaps:
        for o in overlaps:
            print("OVERLAP p%d %s x %s: %dx%d px" % o)
        sys.exit("refusing to write overlapping article boxes -- split the L-shaped article instead")

    issue = {"issueDate": "2026-08-08", "issueNumber": 196, "pages": doc.page_count, "articles": articles}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(issue, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"wrote {OUT}: {len(articles)} articles")
    for a in articles:
        print(f"  p{a['page']} {a['id']:24s} {a['type']:7s} {a['width']:5d}x{a['height']:<5d} "
              f"title={a['title'][:30]!r} body={len(a['bodyText'])}ch photo={'Y' if a['photoUrl'] else '-'}")
    if unclaimed:
        print(f"\n{len(unclaimed)} text line(s) no article claimed:")
        for u in unclaimed:
            print("  ", *u)


if __name__ == "__main__":
    main()
