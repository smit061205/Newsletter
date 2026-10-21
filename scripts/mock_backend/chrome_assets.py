#!/usr/bin/env python3
"""One-time chrome assets for the backend: the paper's masthead, running
headers and footer as printed on 8 August, with the parts that change every
day (issue number, date, page number) taken OUT, plus a template saying
exactly where and how to set those parts again -- position, font, size,
colour, baseline -- measured the same way as the replica.

Writes:
  web/public/chrome/blank-first.png   page 1 masthead + edition bar, no issue/date
  web/public/chrome/blank-inner.png   running header for inner pages, no date/folio
  web/public/chrome/blank-last.png    running header for the last page, no date/folio
  web/public/chrome/footer-last.png   the legal line at the foot of the last page
  publications/capital-kranti/chrome.json   the dynamic fields

The text is removed with PyMuPDF redaction on a copy of the page, text only:
the coloured bars, rules and ornaments under it stay exactly as printed.
"""
import json
import os
import sys

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "replica"))
from extract_source import ARTICLES, CHROME_BOTTOM, CHROME_TOP, inside  # noqa: E402
from bharati_decode import decode, is_legacy  # noqa: E402
from from_source import PX, SRC, font_for, hexcolor, is_light, line_top, text_element  # noqa: E402

# Hind Bold is set at this share of the printed Bharati size to match its
# letter height -- measured on the dark edition-bar text, where ink height is
# reliable (white text on a coloured bar isn't: the bar's edges read as ink)
LIGHT_SIZE_RATIO = 0.815

OUT_IMG = os.path.join(ROOT, "web", "public", "chrome")
OUT_TPL = os.path.join(ROOT, "publications", "capital-kranti", "chrome.json")

# which printed spans are the day's: (role, source page, field, text it starts with)
DYNAMIC = [
    ("first", 1, "issue", "અંક"),
    ("first", 1, "date", "તારીખ"),
    ("inner", 2, "date", "તારીખ"),
    ("inner", 2, "folio", "૨"),
    ("last", 4, "date", "તારીખ"),
    ("last", 4, "folio", "૪"),
]


def span_line(page, start, top):
    """One printed span (decoded text starting with `start`, in the chrome
    band) in the generator's line format, its box from its own characters."""
    for b in page.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for sp in l["spans"]:
                raw = "".join(c["c"] for c in sp["chars"])
                text = (decode(raw)[0] if is_legacy(sp["font"]) else raw).strip()
                if not text.startswith(start) or sp["bbox"][3] > top + 1:
                    continue
                ink = [fitz.Rect(c["bbox"]) for c in sp["chars"] if c["c"].strip()]
                box = ink[0]
                for r in ink[1:]:
                    box |= r
                return {"bbox": box, "text": text, "runs": [[text, None, None, box]], "font": font_for(sp["font"]),
                        "size": round(sp["size"], 1), "color": hexcolor(sp["color"]), "origin_y": sp["origin"][1],
                        "origin_x": sp["origin"][0], "pdf_font": sp["font"].split("+")[-1]}
    raise SystemExit(f"no span starting {start!r} on page {page.number + 1}")


def main():
    os.makedirs(OUT_IMG, exist_ok=True)
    os.makedirs(os.path.dirname(OUT_TPL), exist_ok=True)
    doc = fitz.open(SRC)
    template = {"dpi": 300, "roles": {}}
    for role, pno in (("first", 1), ("inner", 2), ("last", 4)):
        page = doc[pno - 1]
        top = CHROME_TOP[pno]
        fields = {}
        for r, p, field, start in DYNAMIC:
            if r != role:
                continue
            line = span_line(page, start, top)
            el = text_element(page, [line], f"{role}-{field}", None)[0]
            if is_light(line["color"]):
                size = LIGHT_SIZE_RATIO * line["size"] * PX
                scale = size / el["size"]
                el["size"] = round(size, 2)
                el["width"] = round(el["width"] * scale, 2)
                el["y"] = round(line_top(el["font"], el["size"], el["lineHeight"], line["origin_y"]), 3)
            for k in ("_baseline", "_ink", "_size", "_single"):
                el.pop(k, None)
            fields[field] = {
                "x": el["x"], "y": el["y"], "width": el["width"], "height": el["height"],
                "font": el["font"], "size": el["size"], "lineHeight": el["lineHeight"],
                "color": el["color"], "hScale": el.get("hScale", 1.0),
                "printed": line["text"], "redact": [round(v, 2) for v in line["bbox"]],
                # as printed: the real font sets the field at its own size, on its own baseline
                "printedFont": line["pdf_font"], "printedSize": round(line["size"] * PX, 2),
                "baseline": round(line["origin_y"] * PX, 2), "left": round(line["origin_x"] * PX, 2),
            }

        # blank art: a copy of the page with only those spans' text removed
        work = fitz.open()
        work.insert_pdf(doc, from_page=pno - 1, to_page=pno - 1)
        wp = work[0]
        for f in fields.values():
            r = fitz.Rect(f["redact"])
            wp.add_redact_annot(fitz.Rect(r.x0 - 0.5, r.y0 - 0.5, r.x1 + 0.5, r.y1 + 0.5), fill=False)
        wp.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                            text=fitz.PDF_REDACT_TEXT_REMOVE)
        clip = fitz.Rect(0, 0, wp.rect.width, top)
        name = f"blank-{role}.png"
        wp.get_pixmap(dpi=300, clip=clip).save(os.path.join(OUT_IMG, name))
        template["roles"][role] = {
            "art": {"url": f"/chrome/{name}", "x": 0, "y": 0, "width": round(wp.rect.width * PX, 2),
                    "height": round(top * PX, 2)},
            "bodyTop": round(top * PX, 2),
            "fields": fields,
        }
        if pno in CHROME_BOTTOM:
            bottom = CHROME_BOTTOM[pno]
            clip = fitz.Rect(0, bottom, page.rect.width, page.rect.height)
            page.get_pixmap(dpi=300, clip=clip).save(os.path.join(OUT_IMG, "footer-last.png"))
            template["roles"][role]["footer"] = {
                "url": "/chrome/footer-last.png", "x": 0, "y": round(bottom * PX, 2),
                "width": round(page.rect.width * PX, 2), "height": round((page.rect.height - bottom) * PX, 2)}
            template["roles"][role]["bodyBottom"] = round(bottom * PX, 2)
    template["page"] = {"width": round(doc[0].rect.width * PX, 2), "height": round(doc[0].rect.height * PX, 2)}
    # which profile font sets each printed font (the paper's own faces)
    template["fontMap"] = {"BBharatiGopikaTwo,Bold": "gopika-bold", "BBharatiGopikaTwo": "gopika-regular"}

    # The day's stand-in ads: each creative cut to its own pictures and drawn
    # boxes (and the text inside them) -- never a neighbouring story's loose
    # text that happens to sit inside the ad's rough region.
    ads_dir = os.path.join(OUT_IMG, "ads")
    os.makedirs(ads_dir, exist_ok=True)
    template["ads"] = []
    for aid, pno, typ, rough in ARTICLES:
        if typ != "ad":
            continue
        page = doc[pno - 1]
        # an ad picture can be one image spanning two ad regions (8 August's
        # Bhagwat ad and the nature camp below it are one creative)
        # a picture belongs to the ad whose region holds its centre, whole --
        # 8 August's Bhagwat creative is one image wider than its rough region
        region = fitz.Rect(rough)
        pics = [fitz.Rect(i["bbox"]) for i in page.get_image_info()
                if region.contains(fitz.Rect(i["bbox"]).tl + (fitz.Rect(i["bbox"]).br - fitz.Rect(i["bbox"]).tl) * 0.5)]
        parts = pics + [d["rect"] for d in page.get_drawings() if inside(rough, tuple(d["rect"])) and d["rect"].get_area() > 20]
        if not parts:
            continue
        r = parts[0]
        for q in parts[1:]:
            r |= q
        if not pics:
            r &= region
        name = f"{aid}.png"
        page.get_pixmap(dpi=300, clip=r).save(os.path.join(ads_dir, name))
        template["ads"].append({"id": aid, "page": pno, "x": round(r.x0 * PX, 2), "y": round(r.y0 * PX, 2),
                                "width": round(r.width * PX, 2), "height": round(r.height * PX, 2),
                                "url": f"/chrome/ads/{name}"})
    json.dump(template, open(OUT_TPL, "w"), ensure_ascii=False, indent=1)
    print(f"wrote {OUT_TPL}, {len(template['roles'])} blank headers and {len(template['ads'])} ad creatives to {OUT_IMG}")
    for role, r in template["roles"].items():
        for f, v in r["fields"].items():
            print(f"  {role:5} {f:5} {v['printed']!r:34} font {v['font']} size {v['size']} at x {v['x']}")


if __name__ == "__main__":
    main()
