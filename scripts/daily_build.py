#!/usr/bin/env python3
"""Phase 9 orchestrator (docs/PRECISION_ROADMAP.md): fetch/assign -> flow text
(Phase 4) -> place photos (Phase 5) -> compose pages (Phase 6) -> QA (Phase 7)
-> gated handoff. Ties together every phase built this project into one
runnable pipeline, with an explicit, tested failure mode rather than an
assumed one.

Defined failure mode (the two concrete cases Phase 9's plan flagged as
needing "a decision, not a default"):
  1. A story's content overflows its frame even after Phase 4's bounded
     auto-shrink (see layout_lib.MIN_FIT_RATIO): that assignment is NOT
     composited, and the whole run is marked NEEDS_REVIEW -- silently
     shipping a page with a dropped/truncated story would misinform
     readers, which is worse than a held run. This is not a hypothetical:
     tested directly against a deliberately oversized story below (see
     _TEST_OVERSIZED_STORY), confirming the pipeline actually catches it.
  2. A story assignment is missing required fields (e.g. no headline): that
     one assignment is skipped and logged, the rest of the run continues --
     one bad assignment must not abort pages that are otherwise fine.

Output: READY runs go to out/final/, NEEDS_REVIEW runs go to out/staging/
with a written report -- print-ready output and "needs a human" output are
never in the same place, so nothing gets shipped by accident.

Usage: python3 scripts/daily_build.py [--include-overflow-test]
"""
import sys
import os
import json
import argparse
import fitz

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from layout_lib import flow_gujarati_text, composite_snippet, place_photo_cropped, draw_open_photo_slot
from build_header_v2 import tx, ty, render_edition_bar_snippet
import review_manifest
from running_header import build_running_header
from layout_lib import calibration_ratio
import verify_page

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
FINAL_DIR = f"{ROOT}/out/final"
STAGING_DIR = f"{ROOT}/out/staging"

REQUIRED_STORY_FIELDS = {"headline", "bodyColumns"}


def build_page1_masthead(page):
    src = fitz.open(SRC_PDF)
    src_clip = fitz.Rect(14.85, 12.064, 1091.09, 246.98)
    tgt_rect = fitz.Rect(tx(src_clip.x0), ty(src_clip.y0), tx(src_clip.x1), ty(src_clip.y1))
    page.show_pdf_page(tgt_rect, src, 0, clip=src_clip)

    edition_bg = fitz.Rect(17.002, 243.814, 1092.746, 266.054)
    tab_left = fitz.Rect(15.902, 243.664, 27.737, 267.054)
    tab_right = fitz.Rect(1081.071, 243.664, 1092.906, 267.054)
    page.draw_rect(edition_bg, color=None, fill=(255/255, 253/255, 232/255))
    page.draw_rect(tab_left, color=None, fill=(0/255, 173/255, 239/255))
    page.draw_rect(tab_right, color=None, fill=(0/255, 173/255, 239/255))
    cyan = (0/255, 174/255, 239/255)
    page.draw_line(fitz.Point(16.592, 244.074), fitz.Point(1092.616, 244.074), color=cyan, width=2.04)
    page.draw_line(fitz.Point(16.592, 266.754), fitz.Point(1092.616, 266.754), color=cyan, width=2.04)
    render_edition_bar_snippet(width_pt=edition_bg.width, height_pt=edition_bg.height)
    snippet_doc = fitz.open(f"{ROOT}/out/_edition_bar_snippet.pdf")
    page.show_pdf_page(edition_bg, snippet_doc, 0)
    return snippet_doc


def build_story(page, frames, assignment, keep_alive, run_log):
    """Flows one story into its assigned frames. Returns True if every piece
    composited cleanly, False if anything was skipped (missing fields or a
    genuine content-fit failure) -- either way logs exactly what happened."""
    story = assignment["story"]
    missing = REQUIRED_STORY_FIELDS - story.keys()
    if missing:
        run_log.append(("SKIPPED_ASSIGNMENT", assignment["id"], f"story missing required fields: {missing}"))
        return False

    ok = True
    pieces = []
    if "headline_frame" in assignment and "headline" in story:
        pieces.append((assignment["headline_frame"], story["headline"], "left"))
    if "kicker_frame" in assignment and story.get("kicker"):
        pieces.append((assignment["kicker_frame"], story["kicker"], "left"))
    for fid, text in zip(assignment.get("body_frames", []), story.get("bodyColumns", [])):
        pieces.append((fid, text, "justify"))

    for fid, text, align in pieces:
        f = frames[fid]
        # NOTE: the font role is always read from the frame's OWN sourceFont
        # metadata, never assumed by piece type (headline vs body) -- an
        # earlier version hardcoded "BBharatiGopikaTwo,Bold" for every
        # headline, which happened to match every frame used in this
        # session's two happy-path stories by coincidence, but produced a
        # genuinely wrong calibrated size (18.43pt vs the correct 17.62pt)
        # the moment a frame using a different source font (BBharatiTitleTwo)
        # was actually exercised, caught only because the deliberate overflow
        # test below exercised a different frame than the happy path had.
        source_font = f.get("sourceFont")
        if source_font is None:
            run_log.append(("SKIPPED_FRAME", fid, "frame has no sourceFont in template.json"))
            ok = False
            continue
        try:
            path, size, top_off, fit = flow_gujarati_text(text, f, source_font, f["fontSizePt"], align=align)
        except ValueError as e:
            # a distinct failure mode from content-overflow: this frame needs
            # a font role (e.g. BBharatiTitleTwo/Baloo Bhai 2, BBharatiMaruti/
            # Mukta Vaani) whose local font file hasn't been downloaded yet --
            # see layout_lib.FONT_ROLES, which currently only covers
            # BBharatiGopikaTwo (Regular+Bold). Skipped, not silently
            # rendered in a wrong fallback font.
            run_log.append(("MISSING_FONT_ASSET", fid, str(e)))
            ok = False
            continue
        if not fit["fits"]:
            run_log.append(("CONTENT_OVERFLOW", fid,
                             f"did not fit even at shrink_ratio={fit['shrink_ratio']} "
                             f"after {fit['attempts']} attempts -- needs an editorial trim"))
            ok = False
            continue
        keep_alive.append(composite_snippet(page, f, path, top_off, fit))
        if fit["shrink_ratio"] < 1.0:
            run_log.append(("AUTO_SHRUNK", fid, f"shrunk to {fit['shrink_ratio']} of calibrated size to fit"))

    photo_frame = assignment.get("photo_frame")
    if photo_frame and story.get("photo_path"):
        place_photo_cropped(page, frames[photo_frame], story["photo_path"])
    elif photo_frame:
        draw_open_photo_slot(page, frames[photo_frame])

    return ok


def run(content_plan, run_name):
    tmpl = json.load(open(f"{ROOT}/web/src/lib/template.json"))
    target = fitz.open(TARGET_PDF)
    keep_alive = []
    run_log = []
    touched_pages = {}  # page_num -> set(frame_ids assigned)

    for page_num, assignments in content_plan.items():
        page_idx = page_num - 1
        page = target[page_idx]
        frames = {f["id"]: f for f in tmpl["pages"][str(page_num)]["frames"]}
        touched_pages.setdefault(page_num, set())

        if page_num == 1:
            keep_alive.append(build_page1_masthead(page))
        else:
            keep_alive.append(build_running_header(
                page, fitz.open(SRC_PDF), page_idx,
                calibration_ratio_fn=lambda size: size * calibration_ratio("BBharatiGopikaTwo,Bold", size),
            ))

        for assignment in assignments:
            build_story(page, frames, assignment, keep_alive, run_log)
            for key in ("headline_frame", "kicker_frame", "photo_frame"):
                if assignment.get(key):
                    touched_pages[page_num].add(assignment[key])
            touched_pages[page_num].update(assignment.get("body_frames", []))

    # ---- Phase 7 QA gate: verify every touched frame on every touched page.
    # verify() needs a saved PDF to open, so save to staging first -- the
    # READY/NEEDS_REVIEW decision below decides whether that staged file gets
    # promoted to out/final/ or left for review, never both. ----
    os.makedirs(STAGING_DIR, exist_ok=True)
    os.makedirs(FINAL_DIR, exist_ok=True)
    staged_path = f"{STAGING_DIR}/{run_name}.pdf"
    target.save(staged_path)

    qa_fail = False
    all_qa_results = []
    for page_num, frame_ids in touched_pages.items():
        if not frame_ids:
            continue
        results, counts = verify_page.verify(staged_path, page_num, only_frame_ids=frame_ids)
        all_qa_results.append((page_num, results, counts))
        if counts["FAIL"] > 0:
            qa_fail = True

    overflow_fail = any(kind == "CONTENT_OVERFLOW" for kind, *_ in run_log)
    status = "NEEDS_REVIEW" if (qa_fail or overflow_fail) else "READY"

    print(f"=== daily_build run: {run_name} ===")
    for kind, fid, msg in run_log:
        print(f"[{kind}] {fid}: {msg}")
    for page_num, results, counts in all_qa_results:
        print(f"\n-- page {page_num} QA --")
        verify_page.print_report(results, counts)

    if status == "READY":
        final_path = f"{FINAL_DIR}/{run_name}.pdf"
        os.replace(staged_path, final_path)
        print(f"\nSTATUS: READY -> {final_path}")
        pdf_for_manifest = final_path
    else:
        report_path = f"{STAGING_DIR}/{run_name}.report.txt"
        with open(report_path, "w") as fh:
            fh.write(f"STATUS: NEEDS_REVIEW\n\n")
            for kind, fid, msg in run_log:
                fh.write(f"[{kind}] {fid}: {msg}\n")
            for page_num, results, counts in all_qa_results:
                fh.write(f"\n-- page {page_num} QA --\n")
                for s, fid, msg, delta in results:
                    if s == "FAIL":
                        fh.write(f"[FAIL] {fid}: {msg}\n")
        print(f"\nSTATUS: NEEDS_REVIEW -> held at {staged_path}, report at {report_path}")
        pdf_for_manifest = staged_path

    # ---- review UI: render each touched page + write the manifest the
    # Next.js /review route reads (scripts/review_manifest.py) ----
    manifest_path = review_manifest.write_manifest(
        run_name, status, pdf_for_manifest, touched_pages, all_qa_results, run_log,
    )
    print(f"review manifest -> {manifest_path}")

    return status


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--include-overflow-test", action="store_true",
                     help="deliberately include a story too long for its frame, to prove the failure path")
    args = ap.parse_args()

    STORY_PRAG = {
        "headline": "IIT ગાંધીનગર દ્વારા નીતિ-સંશોધન માટે 'પ્રાગ' પહેલનો પ્રારંભ",
        "subhead": None,
        "kicker": "ટેકનોલોજી અને શાસનના સંગમ પર નિષ્ણાતોની ચર્ચા, ભૂતપૂર્વ મુખ્ય સચિવો પણ જોડાયા",
        "bodyColumns": [
            "ગાંધીનગર: IIT ગાંધીનગરે 11 ઓગસ્ટના રોજ 'પ્રાગ' (પોલિસી રિસર્ચ એન્ડ એનાલિટિક્સ ફોર "
            "ગવર્નન્સ) પહેલનો પ્રારંભ કર્યો, જે ટેકનોલોજી, જાહેર નીતિ અને શાસનને એક મંચ પર લાવવાનો પ્રયાસ છે.",
            "સંસ્થાના ફાઉન્ડેશન કાર્યક્રમ અંતર્ગત યોજાયેલ આ પ્રસંગે 'જાહેર નીતિમાં ટેકનોલોજી સંસ્થાઓની "
            "ભૂમિકા' વિષય પર પેનલ ચર્ચા યોજાઈ હતી.",
            "ગુજરાત સરકારના ભૂતપૂર્વ મુખ્ય સચિવ શ્રી રાજ કુમાર અને ભૂતપૂર્વ અધિક મુખ્ય સચિવ શ્રી "
            "જે.પી. ગુપ્તા સહિત અનેક નિષ્ણાતોએ ચર્ચામાં ભાગ લીધો હતો.",
            "પ્રો. પ્રહર્ષ એમ. પટેલ અને પ્રો. દીપક સિંઘાનિયા આ પહેલનું સંકલન કરી રહ્યા છે.",
        ],
        "photo_path": f"{ROOT}/web/public/photos/prag1.jpg",
    }
    STORY_CBI_BRIBERY = {
        "kicker": "CBI કોર્ટ, અમદાવાદનો ચુકાદો; 2013ના ટ્રેપ કેસમાં 13 વર્ષે સજા",
        "headline": "લાંચ કેસમાં આવકવેરા અધિકારીને ત્રણ વર્ષની જેલ",
        "bodyColumns": [
            "અમદાવાદ: CBI કોર્ટ, અમદાવાદે 21 ઓગસ્ટના રોજ આવકવેરા અધિકારી જરનૈલ બી. સિંઘને લાંચ કેસમાં "
            "દોષિત ઠેરવી ત્રણ વર્ષની સખત કેદ અને ₹20,000ના દંડની સજા ફટકારી હતી.",
            "પ્રત્યક્ષકર ભવન, અમદાવાદ ખાતે ફરજ બજાવતા સિંઘ સામે 'શ્રીલેખા વિવિધલક્ષ્મી ચેરિટેબલ ટ્રસ્ટ'ને "
            "આવકવેરા કાયદાની કલમ 11 અને 80G હેઠળ મુક્તિ આપવા બદલ ₹10,000ની લાંચ માંગ્યાનો આરોપ હતો.",
            "CBIએ 22 ફેબ્રુઆરી, 2013ના રોજ છટકું ગોઠવી આરોપીને લાંચ સ્વીકારતા રંગેહાથ ઝડપી પાડ્યો હતો અને "
            "એ જ દિવસે ધરપકડ કરી હતી. તપાસ બાદ 31 ઓક્ટોબર, 2013ના રોજ ચાર્જશીટ દાખલ કરાઈ હતી.",
            "લગભગ 13 વર્ષની ટ્રાયલ બાદ કોર્ટે આરોપીને દોષિત ઠેરવ્યો, જે કેન્દ્ર સરકારના ભ્રષ્ટાચાર વિરોધી "
            "અભિયાનનું વધુ એક ઉદાહરણ ગણાવાઈ રહ્યું છે.",
        ],
    }

    content_plan = {
        1: [{
            "id": "page1-prag", "story": STORY_PRAG,
            "headline_frame": "p1-12", "kicker_frame": "p1-21",
            "body_frames": ["p1-20", "p1-22", "p1-23", "p1-24"],
            "photo_frame": "p1-15",
        }],
        2: [{
            "id": "page2-cbi", "story": STORY_CBI_BRIBERY,
            "headline_frame": "p2-23", "kicker_frame": "p2-26",
            "body_frames": ["p2-24", "p2-25", "p2-27", "p2-28"],
        }],
    }

    if args.include_overflow_test:
        # deliberately far too long for a single 62pt-tall column -- proves
        # the NEEDS_REVIEW path actually triggers rather than assuming it
        # would. Body-only (no headline_frame): isolates the content-overflow
        # failure mode from the separate missing-font-asset one -- an earlier
        # version of this test used p2-8 as the headline frame, which needs
        # BBharatiTitleTwo (no local font file registered for it yet), and
        # conflated two different real findings into one confusing result.
        oversized_story = {
            "headline": "ટેસ્ટ ઓવરફ્લો સ્ટોરી",
            "bodyColumns": [
                "આ એક ખૂબ લાંબો ફકરો છે જે ફ્રેમમાં સમાતો નથી અને ઓવરફ્લો થાય છે. " * 20,
            ],
        }
        content_plan[2].append({
            "id": "page2-overflow-test", "story": oversized_story,
            "body_frames": ["p2-15"],  # a short, narrow frame -- guaranteed overflow
        })

    run_name = "daily_2026-08-25_overflow-test" if args.include_overflow_test else "daily_2026-08-25"
    status = run(content_plan, run_name=run_name)
    sys.exit(0 if status == "READY" else 1)
