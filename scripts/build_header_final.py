#!/usr/bin/env python3
"""Definitive header build: real vector content throughout, no raster fallback.

Two techniques, both proven this session rather than assumed:
  1. The STATIC masthead (logo, wordmark, tagline, contact bar, RNI, both
     subtitles) never changes issue to issue -- so it's copied directly out of
     the source PDF's content stream via page.show_pdf_page(), which embeds the
     real glyphs AND the real embedded BBharati* font program. Not recreated,
     not approximated: the original bytes.
  2. The DYNAMIC edition bar (date/issue number/day) has to regenerate daily,
     so it can't be copied from a historical file. PyMuPDF's own insert_text()
     was tested directly against Noto Sans Gujarati and shapes conjuncts/matras/
     digits correctly -- unlike pdf-lib's fontkit, which crashes or mis-shapes
     the same text (see git history). So the dynamic part is real vector text
     too, just via a different (working) engine than the static part.

Usage: python3 scripts/build_header_final.py
"""
import fitz
import datetime

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
GUJ_FONT = f"{ROOT}/web/fonts/NotoSansGujarati-Bold.ttf"
OUT_PDF = f"{ROOT}/out/page-1-header-vector.pdf"

# canonical transform, established and reused throughout this project
ISSUE_ORIGIN, ISSUE_PITCH = 14.2076, 136.1467
CANON_ORIGIN, CANON_PITCH = 15.51, 136.084
SCALE = CANON_PITCH / ISSUE_PITCH
Y_OFFSET_P1 = -3.166

def tx(x): return CANON_ORIGIN + (x - ISSUE_ORIGIN) * SCALE
def ty(y): return y + Y_OFFSET_P1

GUJ_DIGITS = "૦૧૨૩૪૫૬૭૮૯"
def to_guj_digits(s):
    return "".join(GUJ_DIGITS[int(c)] if c.isdigit() else c for c in str(s))

def edition_bar_text(issue_no=212):
    today = datetime.date.today()
    days = ["સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર", "રવિવાર"]
    dow = days[today.weekday()]
    date_str = to_guj_digits(today.strftime("%d-%m-%Y"))
    parts = [
        f"વર્ષ : {to_guj_digits(34)}",
        f"અંક : {to_guj_digits(issue_no)}",
        f"તારીખ : {date_str}, {dow}",
        f"કિંમત : {to_guj_digits(50)} પૈસા",
        "તંત્રી : પાર્થ એમ. ઠક્કર",
        "બ્યુરો ચીફ : બિજેન કાપડિયા (અમદાવાદ)",
        "મેનેજિંગ તંત્રી : સુરેશ ચંડી",
    ]
    return parts


def main():
    src = fitz.open(SRC_PDF)
    target = fitz.open(TARGET_PDF)
    tgt_page = target[0]

    # ---- 1. static masthead: real vector copy ----
    src_clip = fitz.Rect(14.85, 12.064, 1091.09, 246.98)
    tgt_rect = fitz.Rect(tx(src_clip.x0), ty(src_clip.y0), tx(src_clip.x1), ty(src_clip.y1))
    tgt_page.show_pdf_page(tgt_rect, src, 0, clip=src_clip)

    # ---- 2. dynamic edition bar: real vector text, PyMuPDF's own engine ----
    # geometry from header_spec.json (already measured/reconciled this session)
    edition_bg = fitz.Rect(17.002, 243.814, 1092.746, 266.054)
    tab_left   = fitz.Rect(15.902, 243.664, 27.737, 267.054)
    tab_right  = fitz.Rect(1081.071, 243.664, 1092.906, 267.054)

    tgt_page.draw_rect(edition_bg, color=None, fill=(255/255, 253/255, 232/255))
    tgt_page.draw_rect(tab_left, color=None, fill=(0/255, 173/255, 239/255))
    tgt_page.draw_rect(tab_right, color=None, fill=(0/255, 173/255, 239/255))

    tgt_page.insert_font(fontname="gujbold", fontfile=GUJ_FONT)
    guj_font = fitz.Font(fontfile=GUJ_FONT)
    parts = edition_bar_text()
    size = 11
    ink = (35/255, 31/255, 32/255)
    gold = (154/255, 104/255, 55/255)
    x = edition_bg.x0 + 10
    y = edition_bg.y1 - 6  # baseline, near the bottom of the bar
    for i, part in enumerate(parts):
        if i > 0:
            tgt_page.insert_text((x, y), "•", fontname="gujbold", fontsize=8, color=gold)
            x += 10
        tgt_page.insert_text((x, y), part, fontname="gujbold", fontsize=size, color=ink)
        w = guj_font.text_length(part, fontsize=size)
        x += w + 6

    target.save(OUT_PDF)
    print(f"wrote {OUT_PDF}")


if __name__ == "__main__":
    main()
