"""Typographic statistics of a printed issue, read back from its PDF: how
evenly the body text is spaced, how fully display lines fill their measure,
the headline sizes, and how much of each page is body copy. Run it on the
reference issue and on a build to compare them by numbers, not by eye.

    python3 scripts/replica/style_stats.py <issue.pdf> [--grid 14.4,124.2,11.884,8]

Body text is the most common font+size. A word gap is the distance from the
last mark of one word to the first mark of the next (space included); a
"display" line is any line set larger than 1.4x the body size.
"""
import argparse
import collections
import math
import statistics

from pdfminer.high_level import extract_pages
from pdfminer.layout import LAParams, LTChar, LTTextLine


def lines_of(pdf):
    for page in extract_pages(pdf, laparams=LAParams(line_margin=0.1, char_margin=1.0)):
        found = []

        def walk(o):
            if isinstance(o, LTTextLine):
                chars = [c for c in o if isinstance(c, LTChar)]
                if chars:
                    found.append(chars)
            elif hasattr(o, "__iter__"):
                for c in o:
                    walk(c)

        walk(page)
        yield page, found


def q(values, p):
    if not values:
        return float("nan")
    s = sorted(values)
    return s[min(len(s) - 1, int(p * (len(s) - 1)))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--grid", default="14.4,124.2,11.884,8", help="left,column,gutter,columns in pt")
    a = ap.parse_args()
    _, col, gut, ncols = [float(x) for x in a.grid.split(",")]
    span = lambda k: k * col + (k - 1) * gut

    pages = list(lines_of(a.pdf))
    sizes = collections.Counter()
    for _, ls in pages:
        for chars in ls:
            sizes[(chars[0].fontname.split("+")[-1], round(chars[0].size, 1))] += 1
    (body_font, body_size), _ = sizes.most_common(1)[0]
    print(f"body: {body_font} {body_size}pt")
    for page, ls in pages:
        band = page.height  # whole page; body share is relative
        gaps, letter, body_lines, display = [], [], 0, []
        for chars in ls:
            font, size = chars[0].fontname.split("+")[-1], round(chars[0].size, 1)
            x0, x1 = min(c.x0 for c in chars), max(c.x1 for c in chars)
            w = x1 - x0
            if font == body_font and abs(size - body_size) < 0.3:
                body_lines += 1
                if w < span(1) * 0.9:
                    continue  # a paragraph's last line: not justified
                marks = [c for c in chars if c.get_text().strip()]
                for i in range(len(marks) - 1):
                    g = marks[i + 1].x0 - marks[i].x1
                    between = [c for c in chars if marks[i].x1 - 0.01 <= c.x0 and c.x1 <= marks[i + 1].x0 + 0.01 and not c.get_text().strip()]
                    if between or g > 0.18 * size:
                        gaps.append(g)
                    else:
                        letter.append(g)
            elif size > 1.4 * body_size:
                k = next((k for k in range(1, int(ncols) + 1) if span(k) >= w - 1), int(ncols))
                display.append((size, w / span(k), k))
        fills = [f for _, f, _ in display]
        print(f"page {page.pageid}: body lines {body_lines}; word gap p50 {q(gaps, .5):.2f} p90 {q(gaps, .9):.2f} "
              f"max {max(gaps) if gaps else float('nan'):.2f}pt; letter gap p90 {q(letter, .9):.2f}pt; "
              f"display lines {len(display)}, fill p10 {q(fills, .1):.2f} median {q(fills, .5):.2f}; "
              f"display sizes {sorted({round(s) for s, _, _ in display}, reverse=True)[:8]}")


if __name__ == "__main__":
    main()
