#!/usr/bin/env python3
"""Phase 7 QA harness (docs/PRECISION_ROADMAP.md): codifies the manual
"extract built spans -> compare against expected" loop used throughout this
project (it's what caught every real defect in the header and the Phase 4/5
proof) into a script that runs automatically, instead of by hand each time.

Checks, per frame in template.json for the given page:
  - font size: rendered size vs. declared_size x Phase 3 calibration ratio
  - leading: for multi-line text, consecutive baseline gap vs 1.2x declared
    calibrated size
  - bounds: rendered content must not overflow its frame rect (small
    tolerance for sub-pixel rounding)
  - photo aspect: placed image aspect ratio vs frame aspect ratio

A frame with literally nothing rendered in it is reported NOT_BUILT, not
FAIL -- most frames in this project are legitimately not built yet (Phase 8
content ingestion doesn't exist), and treating "empty" as a failure would
make the report useless noise. Only a frame with content that's actually
Wrong gets FAIL.

Usage: python3 scripts/verify_page.py <built_pdf> --page <1-4> [--pdf-page N]
"""
import sys
import argparse
import json
import fitz

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from layout_lib import calibration_ratio, LEADING_RATIO, MIN_FIT_RATIO

ROOT = "/Users/smitthakkar/NewsPaper_Project"

TEXT_TYPES = {"headline_L1", "headline_L2", "subhead_kicker", "body_or_caption"}
BOUNDS_TOL = 0.5  # pt, sub-pixel rounding tolerance
SIZE_TOL = 0.05   # pt


def assign_spans_to_frames(tdict, candidate_frames, pad=2.0):
    """Assigns each text span on the page to exactly ONE frame -- the
    SMALLEST-area candidate frame whose bbox contains the span's center
    point -- rather than every frame whose bbox happens to overlap it.

    Some frames in template.json (e.g. a headline_L1 box sized generously
    for a multi-line display headline) geometrically overlap other frames
    sitting inside that same vertical space (body columns positioned below
    where the headline actually ends). A naive per-frame independent bbox
    scan double-counts a body frame's own spans into the oversized headline
    frame's check too -- found when a real BBharatiMaruti headline build
    (p3-20) reported a false FAIL with size 9.68 mixed into an expected
    19.50, which turned out to be p3-21/p3-22's body text bleeding in, not
    an actual defect (confirmed by rendering the page and looking at it
    before concluding the check itself was wrong)."""
    by_frame = {f["id"]: [] for f in candidate_frames}
    for block in tdict["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for sp in line.get("spans", []):
                cx = (sp["bbox"][0] + sp["bbox"][2]) / 2
                cy = (sp["bbox"][1] + sp["bbox"][3]) / 2
                best_frame, best_area = None, None
                for f in candidate_frames:
                    fx0, fy0, fx1, fy1 = f["x0"], f["y0"], f["x1"], f["y1"]
                    if fx0 - pad <= cx <= fx1 + pad and fy0 - pad <= cy <= fy1 + pad:
                        area = (fx1 - fx0) * (fy1 - fy0)
                        if best_area is None or area < best_area:
                            best_frame, best_area = f["id"], area
                if best_frame is not None:
                    by_frame[best_frame].append(sp)
    return by_frame


def check_text_frame(frame, spans):
    results = []
    if not spans:
        return [("NOT_BUILT", frame["id"], "no text found in frame", None)]

    declared = frame.get("fontSizePt")
    source_font = frame.get("sourceFont")
    actual_size_for_leading = None
    if declared and source_font:
        expected_size = declared * calibration_ratio(source_font, declared)
        actual_sizes = sorted(set(round(s["size"], 2) for s in spans))
        if len(actual_sizes) > 1:
            results.append(("WARN", frame["id"], f"mixed sizes in one frame: {actual_sizes}", None))
        actual = actual_sizes[0]
        actual_size_for_leading = actual
        delta = actual - expected_size
        # A frame's Phase 9 auto-shrink (layout_lib.MIN_FIT_RATIO) is a
        # deliberate, logged mechanism, not a defect -- rendering smaller
        # than expected but within that known floor is expected behavior,
        # not something this harness should flag as wrong. Only genuinely
        # larger-than-expected, or smaller than the floor allows, is a real
        # FAIL. Found necessary by testing an actual auto-shrunk frame
        # (p2-8, BBharatiTitleTwo) rather than assuming the two checks
        # (Phase 9's shrink and Phase 7's size check) would compose cleanly.
        min_allowed = expected_size * MIN_FIT_RATIO - SIZE_TOL
        if abs(delta) <= SIZE_TOL:
            status = "PASS"
        elif delta < 0 and actual >= min_allowed:
            status = "PASS"
        else:
            status = "FAIL"
        note = " (within auto-shrink floor)" if (status == "PASS" and delta < -SIZE_TOL) else ""
        results.append((status, frame["id"],
                         f"font size: expected {expected_size:.2f}pt, got {actual:.2f}pt{note}", delta))

    fx0, fy0, fx1, fy1 = frame["x0"], frame["y0"], frame["x1"], frame["y1"]
    max_x1 = max(s["bbox"][2] for s in spans)
    max_y1 = max(s["bbox"][3] for s in spans)
    min_x0 = min(s["bbox"][0] for s in spans)
    min_y0 = min(s["bbox"][1] for s in spans)
    overflow_x = max_x1 - fx1
    overflow_y = max_y1 - fy1
    underflow_x = fx0 - min_x0
    underflow_y = fy0 - min_y0
    worst = max(overflow_x, overflow_y, underflow_x, underflow_y)
    status = "PASS" if worst <= BOUNDS_TOL else "FAIL"
    results.append((status, frame["id"],
                     f"bounds: overflow_x={overflow_x:+.2f} overflow_y={overflow_y:+.2f} "
                     f"underflow_x={underflow_x:+.2f} underflow_y={underflow_y:+.2f}", worst))

    baselines = sorted(set(round(s["origin"][1], 2) for s in spans))
    if len(baselines) >= 2 and declared and source_font:
        # use the ACTUAL measured size (which reflects any Phase 9
        # auto-shrink), not the flat calibrated-from-declared value -- a
        # shrunk frame's real leading is based on its real rendered size,
        # not the unshrunk calibration target.
        expected_leading = (actual_size_for_leading or declared * calibration_ratio(source_font, declared)) * LEADING_RATIO
        gaps = [round(baselines[i + 1] - baselines[i], 2) for i in range(len(baselines) - 1)]
        bad_gaps = [g for g in gaps if abs(g - expected_leading) > 0.1]
        status = "PASS" if not bad_gaps else "FAIL"
        results.append((status, frame["id"], f"leading: expected {expected_leading:.2f}pt, gaps={gaps}", None))

    return results


def check_photo_frame(frame, images):
    if not images:
        return [("NOT_BUILT", frame["id"], "no image found in frame", None)]
    frame_aspect = (frame["x1"] - frame["x0"]) / (frame["y1"] - frame["y0"])
    results = []
    for im in images:
        b = im["bbox"]
        img_aspect = (b[2] - b[0]) / (b[3] - b[1])
        delta = abs(frame_aspect - img_aspect)
        status = "PASS" if delta <= 0.01 else "FAIL"
        results.append((status, frame["id"],
                         f"photo aspect: frame={frame_aspect:.4f} placed={img_aspect:.4f} delta={delta:.4f}", delta))
    return results


def verify(built_pdf, page_num, pdf_page_idx=None, only_frame_ids=None):
    """Reusable entry point (Phase 9 orchestrator imports this directly rather
    than shelling out to the CLI). Returns (all_results, counts) -- same data
    the CLI prints, structured for a caller to act on."""
    pdf_page_idx = pdf_page_idx if pdf_page_idx is not None else page_num - 1

    tmpl = json.load(open(f"{ROOT}/web/src/lib/template.json"))
    all_frames = tmpl["pages"][str(page_num)]["frames"]
    # span assignment (see assign_spans_to_frames) needs every candidate
    # frame on the page, even ones not being reported this call -- an
    # overlapping body frame must still "claim" its own spans away from a
    # generously-sized headline frame, whether or not that body frame is in
    # only_frame_ids.
    text_candidates = [f for f in all_frames if f["type"] in TEXT_TYPES]
    frames = [f for f in all_frames if only_frame_ids is None or f["id"] in only_frame_ids]

    doc = fitz.open(built_pdf)
    page = doc[pdf_page_idx]
    tdict = page.get_text("dict")
    images = page.get_image_info(hashes=False)
    spans_by_frame = assign_spans_to_frames(tdict, text_candidates)

    all_results = []
    for frame in frames:
        if frame["type"] in TEXT_TYPES:
            spans = spans_by_frame.get(frame["id"], [])
            all_results.extend(check_text_frame(frame, spans))
        elif frame["type"] == "photo":
            fx0, fy0, fx1, fy1 = frame["x0"], frame["y0"], frame["x1"], frame["y1"]
            in_frame = [im for im in images if abs(im["bbox"][0] - fx0) < 3 and abs(im["bbox"][1] - fy0) < 3]
            all_results.extend(check_photo_frame(frame, in_frame))

    counts = {"PASS": 0, "FAIL": 0, "WARN": 0, "NOT_BUILT": 0}
    for status, fid, msg, delta in all_results:
        counts[status] += 1
    return all_results, counts


def print_report(all_results, counts):
    for status, fid, msg, delta in all_results:
        marker = {"PASS": "OK  ", "FAIL": "FAIL", "WARN": "WARN", "NOT_BUILT": "----"}[status]
        if status != "NOT_BUILT":
            print(f"[{marker}] {fid:10} {msg}")
    not_built = sorted(set(fid for (s, fid, m, d) in all_results if s == "NOT_BUILT"))
    print(f"\n{len(not_built)} frame(s) not built (skipped, not failed): {not_built}")
    print(f"\nSummary: {counts['PASS']} PASS, {counts['FAIL']} FAIL, {counts['WARN']} WARN, "
          f"{counts['NOT_BUILT']} NOT_BUILT")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("built_pdf")
    ap.add_argument("--page", type=int, required=True, help="1-indexed page key in template.json")
    ap.add_argument("--pdf-page", type=int, default=None, help="0-indexed page in built_pdf (defaults to --page - 1)")
    ap.add_argument("--frames", default=None,
                     help="comma-separated frame ids to check (default: every frame on the page). Scope to "
                          "only what this build actually touched when checking a page with any vector-copied "
                          "region -- show_pdf_page(clip=...) can leave invisible-but-still-enumerated image "
                          "metadata behind for content that's clipped out of view, which get_image_info() "
                          "still reports; checking a photo frame that coincidentally overlaps one of those "
                          "produces a confusing false FAIL against content nobody built or intended to check "
                          "(found on page 4's sponsor-logo-strip frames, confirmed via a visual render that "
                          "nothing actually shows there before concluding it wasn't a real defect).")
    args = ap.parse_args()

    only_frame_ids = set(args.frames.split(",")) if args.frames else None
    all_results, counts = verify(args.built_pdf, args.page, args.pdf_page, only_frame_ids)
    print_report(all_results, counts)
    return 1 if counts["FAIL"] > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
