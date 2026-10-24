# The Capital Kranti website sample (one working page, published as an
# Artifact): the design system in DESIGN.md -- phone first, the printed
# paper's colours, a ruled 4/8/12-column grid, the front page as containers of
# cards, the trust pieces on every story, light/dark following the phone, text
# size, an English switch for the labels -- from 22 Oct 2026's real PIB stories
# and printed pages. Needs Pillow for the e-paper pages.
import base64, io, json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
stories = json.load(open(os.path.join(HERE, "full-img.json")))
SEC = {
    "gujarat": ["p2326788"],
    "world": ["p2326576", "p2326589", "p2326600", "p2326774", "p2326646"],
    "farm": ["p2326794", "p2326879", "p2326374", "p2326715"],
    "economy": ["p2326779", "p2326850", "p2326873", "p2326498"],
    "tech": ["p2326691", "p2326728", "p2326762"],
    "health": ["p2326872"],
    "sport": ["p2326743", "p2326749"],
}
TAG = {i: k for k, ids in SEC.items() for i in ids}
# PIB numbers its releases in order, so the sample's times follow the numbers:
# 9:05 in the morning to 7:40 in the evening.
order = sorted(s["id"] for s in stories)
for s in stories:
    s["sec"] = TAG.get(s["id"], "india")
    s["t"] = 9 * 60 + 5 + round(order.index(s["id"]) * (10 * 60 + 35) / (len(order) - 1))
    s.pop("photo", None)

pages = []
for n in range(1, 5):
    im = Image.open(os.path.join(ROOT, "web", "public", "issues", "2026-10-22", f"{n}.jpg")).convert("RGB")
    im.thumbnail((720, 1000))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=70, optimize=True)
    pages.append("data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode())

js = lambda v: json.dumps(v, ensure_ascii=False).replace("</", "<\\/")
page = open(os.path.join(HERE, "page_template.html")).read()
page = page.replace("__DATA__", js(stories)).replace("__PAGES__", js(pages))
open(os.path.join(HERE, "capital-kranti-website.html"), "w").write(page)
print("ok", os.path.getsize(os.path.join(HERE, "capital-kranti-website.html")) // 1024, "KB")
