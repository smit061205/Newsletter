#!/usr/bin/env python3
"""One-off analysis script (not part of the pipeline) to derive article-level
clusters from capital_kranti_zone_map.json's raw per-element extraction of
the real (196) Capital Kranti_08 august.pdf, for all 4 pages -- the earlier
session only did this grouping by hand for page 1's 4 stories (see the
archived content.ts's PAGE1_CONTENT); this generalizes it to all 4 pages so
the new mock fixtures can replicate the real paper's real article
positions/counts/photo-slots, not just page 1's.

zone_map elements are already in RAW196 pt (bbox[0]=14.85 for the first
navy box matches header_spec.json's header_boxes_raw196_pt exactly) -- no
inverse-transform needed, unlike template.json's canonical-space frames.

Approach: exclude the masthead/running_header chrome band (already drawn
programmatically), exclude "container" ad_or_box rects (large background/
border rects that fully contain other elements -- decorative, not real ad
space), then assign every remaining element to its nearest headline_L1
anchor (one L1 per real story, confirmed against page 1's known-correct
grouping in the archived content.ts) using column-range compatibility +
vertical proximity, falling back to plain nearest-anchor distance when no
column-compatible anchor exists. Elements with no nearby anchor at all
(isolated ad_or_box/photo clusters) become their own "ad" cluster.

This is a heuristic, not a perfect layout parser -- expect a few odd
clusters, meant to be reviewed (label_hint printed for every element) and
patched by hand before trusting the output, same as this project's
established "verify by rendering" discipline elsewhere.
"""
import json

ROOT = "/Users/smitthakkar/NewsPaper_Project"
ZONE_MAP = json.load(open(f"{ROOT}/capital_kranti_zone_map.json"))

CHROME_TYPES = {"masthead", "running_header", "footer"}
CHROME_Y_THRESHOLD = {"1": 269.5, "2": 45.0, "3": 45.0, "4": 45.0}


def bbox_contains(outer, inner, pad=0.5):
    return (outer[0] - pad <= inner[0] and outer[1] - pad <= inner[1]
            and outer[2] + pad >= inner[2] and outer[3] + pad >= inner[3])


def module_overlap(a, b, slack=1):
    return a["module_start"] - slack <= b["module_end"] and b["module_start"] - slack <= a["module_end"]


def cluster_page(page_key):
    raw = ZONE_MAP[page_key]["elements"]
    y_cut = CHROME_Y_THRESHOLD[page_key]
    # exclude elements ENTIRELY within the chrome band (bbox[3]=y1 below the
    # cut), not just ones that START near the top -- a real headline can
    # start at y=35 and run to y=256 (found on page 2: "MENA"), and an
    # earlier version of this filter used bbox[1]>=y_cut, which wrongly
    # dropped that headline as if it were chrome, silently losing an entire
    # real story and its whole cluster (caught by an anchor count of 1 where
    # 2 were expected, not assumed correct from a green run).
    els = [e for e in raw if e["type"] not in CHROME_TYPES and e["bbox"][3] >= y_cut]

    def is_container(e, others):
        if e["type"] != "ad_or_box":
            return False
        return any(o is not e and bbox_contains(e["bbox"], o["bbox"]) for o in others)

    kept = [e for e in els if not is_container(e, els)]

    # headline_L1 alone under-anchors pages 2-4: several real distinct
    # stories there are only marked headline_L2 (page 1's PM_VISIT, the only
    # page with a hand-verified ground truth, used L1+L2 TOGETHER for one
    # story, but pages 2-4 have multiple L2s with no L1 nearby at all --
    # treating L1 as the only anchor type collapsed page 2 into one giant
    # cluster absorbing 20 of its 22 elements). Both types anchor here;
    # expect some over-splitting (an L2 that's really a subhead of an
    # adjacent L1, as in PM_VISIT) -- reviewed and merged by hand below.
    ANCHOR_TYPES = {"headline_L1", "headline_L2"}
    anchors = [e for e in kept if e["type"] in ANCHOR_TYPES]
    others = [e for e in kept if e["type"] not in ANCHOR_TYPES]

    clusters = {id(a): [a] for a in anchors}

    def y_gap(anchor, e):
        # prefer anchor above the element (reading order); penalize anchor below it
        if e["bbox"][1] >= anchor["bbox"][1]:
            return max(0.0, e["bbox"][1] - anchor["bbox"][3])
        return 1e6 + (anchor["bbox"][1] - e["bbox"][1])

    unassigned = []
    for e in others:
        compatible = [a for a in anchors if module_overlap(a, e)]
        pool = compatible if compatible else anchors
        if not pool:
            unassigned.append(e)
            continue
        best = min(pool, key=lambda a: y_gap(a, e))
        clusters[id(best)].append(e)

    # standalone elements with no anchors at all on this page -> own cluster
    for e in unassigned:
        clusters[id(e)] = [e]

    result = []
    for members in clusters.values():
        x0 = min(m["bbox"][0] for m in members)
        y0 = min(m["bbox"][1] for m in members)
        x1 = max(m["bbox"][2] for m in members)
        y1 = max(m["bbox"][3] for m in members)
        types = [m["type"] for m in members]
        has_photo = "photo" in types
        has_text = any(t in ("headline_L1", "headline_L2", "subhead_kicker", "body_or_caption") for t in types)
        result.append({
            "bbox": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
            "w": round(x1 - x0, 2), "h": round(y1 - y0, 2),
            "n_members": len(members), "has_photo": has_photo, "is_ad": not has_text,
            "hints": [(m["type"], (m.get("label_hint") or "")[:24]) for m in members],
        })
    result.sort(key=lambda c: (c["bbox"][1], c["bbox"][0]))
    return result


if __name__ == "__main__":
    for pg in ["1", "2", "3", "4"]:
        clusters = cluster_page(pg)
        print(f"\n==== page {pg}: {len(clusters)} clusters ====")
        for i, c in enumerate(clusters):
            kind = "AD" if c["is_ad"] else ("PHOTO+TEXT" if c["has_photo"] else "TEXT")
            print(f"[{i}] bbox={c['bbox']} w={c['w']} h={c['h']} n={c['n_members']} {kind}")
            for t, h in c["hints"]:
                print(f"      {t}: {h}")
