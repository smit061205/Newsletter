# The Capital Kranti website sample (one working page, published as an
# Artifact): the Washington Post's UI as measured on 24 Oct 2026 -- WPDS-like
# tokens, a 20-column grid with gutter rules, the header (breaking banner,
# alerts, account panel with the theme switch, sections drawer), every home
# module, a section page and an article page -- in Gujarati, from 22 Oct 2026's
# real PIB stories.
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
stories = json.load(open(os.path.join(HERE, "full-img.json")))
TAG = {"p2326788": "gujarat", "p2326576": "world", "p2326600": "world", "p2326774": "world", "p2326589": "world", "p2326646": "world",
       "p2326794": "farm", "p2326879": "farm", "p2326374": "farm", "p2326715": "farm", "p2326779": "economy", "p2326850": "economy",
       "p2326873": "economy", "p2326498": "economy", "p2326691": "tech", "p2326728": "tech", "p2326762": "tech",
       "p2326743": "sport", "p2326749": "sport", "p2326872": "health"}
for s in stories:
    s["sec"] = TAG.get(s["id"], "india")
data = json.dumps(stories, ensure_ascii=False).replace("</", "<\\/")

page = open(os.path.join(HERE, "page_template.html")).read()
open(os.path.join(HERE, "capital-kranti-website.html"), "w").write(page.replace("__DATA__", data))
print("ok", os.path.getsize(os.path.join(HERE, "capital-kranti-website.html")) // 1024, "KB")
