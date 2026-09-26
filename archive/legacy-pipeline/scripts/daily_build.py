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
     --include-overflow-test), confirming the pipeline actually catches it.
  2. A story assignment is missing required fields (e.g. no headline): that
     one assignment is skipped and logged, the rest of the run continues --
     one bad assignment must not abort pages that are otherwise fine.

Phase 1 (docs/PRECISION_ROADMAP.md, "capacity-aware assignment + text
threading"): earlier versions of this file hand-mapped each story to a
specific, hardcoded frame group, and pre-chopped every story's body into
exactly N pieces to match N hardcoded frame ids -- a fixed 1:1 mapping that
had no way to reconcile a fixed, once-measured page grid against content
whose length differs every day. This version instead: (a) defines each
page's frame groups as MODULES (a reusable geometric unit: optional
headline/kicker frame + an ORDERED list of body frames + optional photo
frame), (b) treats each story's body as a single flowing list of paragraphs,
not pre-chopped, (c) assigns stories to modules by solving a real optimal
assignment (OR-Tools CP-SAT, see assign_stories_to_modules/_pair_cost) whose
cost matrix comes from ACTUALLY rendering each candidate story/module pair's
headline, kicker, and body -- not an aggregate size estimate -- instead of a
person hand-picking which named story goes in which named frame group, and
(d) threads each story's paragraphs across its assigned module's body frames
in order (see layout_lib.flow_story_across_frames), spilling into the next
frame only when the current one is full, instead of assuming the story
happens to have exactly as many paragraphs as the module has frames.

A first version of (c) used a cheap greedy heuristic (sort both sides by
total character/frame-area size, pair largest-to-largest). Running it
against this page's real content surfaced its exact known limitation: two
modules can have very similar TOTAL capacity while their headline/kicker
frames differ a lot in size individually, so an aggregate match can place a
story whose kicker doesn't fit its assigned module's specific kicker frame
even though the totals lined up -- caught immediately by the existing
CONTENT_OVERFLOW safety net (NEEDS_REVIEW, not silently shipped), but real
enough to upgrade to a proper solver rather than keep patching the
heuristic's size metric.

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
from ortools.sat.python import cp_model

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from layout_lib import (
    flow_gujarati_text, flow_story_across_frames, composite_snippet,
    place_photo_cropped, draw_open_photo_slot, calibration_ratio,
)
from build_header_v2 import tx, ty, render_edition_bar_snippet
import review_manifest
from running_header import build_running_header
import verify_page

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
FINAL_DIR = f"{ROOT}/out/final"
STAGING_DIR = f"{ROOT}/out/staging"

REQUIRED_STORY_FIELDS = {"headline", "body_paragraphs"}


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


def _resolve_frame(frames, fid, overrides):
    f = dict(frames[fid])
    ov = overrides.get(fid)
    if ov:
        f.update(ov(frames) if callable(ov) else ov)
    return f


def _place_text_piece(page, frames, fid, text, align, overrides, keep_alive, run_log):
    """Flows one piece of text (headline/kicker/anything not part of the
    threaded body) into a single frame. Returns True if it composited."""
    f = _resolve_frame(frames, fid, overrides)
    # NOTE: the font role is always read from the frame's OWN sourceFont
    # metadata, never assumed by piece type -- see the git history of this
    # file for the bug that cost a wrong calibrated size when that wasn't
    # true.
    source_font = f.get("sourceFont")
    if source_font is None:
        run_log.append(("SKIPPED_FRAME", fid, "frame has no sourceFont in template.json"))
        return False
    try:
        path, size, top_off, fit = flow_gujarati_text(text, f, source_font, f["fontSizePt"], align=align)
    except ValueError as e:
        run_log.append(("MISSING_FONT_ASSET", fid, str(e)))
        return False
    if not fit["fits"]:
        run_log.append(("CONTENT_OVERFLOW", fid,
                         f"did not fit even at shrink_ratio={fit['shrink_ratio']} "
                         f"after {fit['attempts']} attempts -- needs an editorial trim"))
        return False
    keep_alive.append(composite_snippet(page, f, path, top_off, fit))
    if fit["shrink_ratio"] < 1.0:
        run_log.append(("AUTO_SHRUNK", fid, f"shrunk to {fit['shrink_ratio']} of calibrated size to fit"))
    return True


def _rects_overlap(a, b, min_area=100):
    """Same threshold used by every pairwise-overlap check run manually this
    session (docs/PRECISION_ROADMAP.md) -- kept identical here so an
    automatic merge is held to the same bar a human review pass would be."""
    ox = max(0, min(a["x1"], b["x1"]) - max(a["x0"], b["x0"]))
    oy = max(0, min(a["y1"], b["y1"]) - max(a["y0"], b["y0"]))
    return (ox * oy) > min_area


def _merge_trailing_unused_frames(body_frames_eff, pieces, all_page_frames):
    """When a story only fills a PREFIX of its module's ordered body frames
    (columns arranged side by side in the real grid) and stops there with no
    leftover text, the frames after the last one used are pure dead space --
    this is most of what showed up as large unlabeled blank regions once
    Phase 1's capacity-aware assignment made most stories comfortably fit
    without needing every frame their module offered. Reclaims that space by
    merging the trailing unused frames into the last used one (a single
    wider rectangle) and letting the caller re-flow the SAME content into
    it -- but only if that merged rectangle doesn't newly overlap any OTHER
    frame on the page (checked directly, not assumed): several modules on
    this page are NOT simple single-row column groups (e.g. the RBI
    module's p2-12 sits in a different row than its own p2-15/p2-16, and
    widening it into their space would run straight into the module's own
    photo frame) -- for those, this correctly declines to merge and leaves
    the unused frames blank rather than risk a geometry it hasn't verified,
    the same "don't guess, check" discipline this session used for every
    other frame-overlap fix. Returns a new list of frame dicts to re-flow
    into, or None if there's nothing to merge or merging isn't safe."""
    if not pieces or len(pieces) >= len(body_frames_eff):
        return None
    used_ids = {f["id"] for f, *_ in pieces}
    last_used_idx = max(i for i, f in enumerate(body_frames_eff) if f["id"] in used_ids)
    trailing = body_frames_eff[last_used_idx + 1:]
    if not trailing:
        return None
    anchor = body_frames_eff[last_used_idx]
    merge_set = [anchor] + trailing
    merged = {
        "id": anchor["id"],
        "x0": anchor["x0"], "y0": anchor["y0"],
        "x1": max(f["x1"] for f in merge_set),
        "y1": max(f["y1"] for f in merge_set),
        "sourceFont": anchor["sourceFont"], "fontSizePt": anchor["fontSizePt"],
    }
    merge_ids = {f["id"] for f in merge_set}
    for other in all_page_frames:
        if other["id"] in merge_ids:
            continue
        if _rects_overlap(merged, other):
            return None
    return body_frames_eff[:last_used_idx] + [merged]


def build_module(page, frames, story, module, keep_alive, run_log, geometry_overrides):
    """Builds one story into one module: headline/kicker/any extra one-off
    pieces placed directly, body paragraphs threaded across the module's
    ordered body_frames (however many the story actually needs -- see
    layout_lib.flow_story_across_frames), photo placed or left an honest
    open slot. Returns (ok, touched_frame_ids). geometry_overrides (a dict
    the caller owns) is written to when a trailing-frame merge happens (see
    _merge_trailing_unused_frames), so the QA pass downstream checks that
    frame against its ACTUAL runtime geometry, not template.json's now-stale
    original bounds -- see verify_page.verify()'s own geometry_overrides."""
    ok = True
    touched = set()
    overrides = module.get("frame_overrides", {})

    if module.get("headline_frame") and story.get("headline"):
        fid = module["headline_frame"]
        ok &= _place_text_piece(page, frames, fid, story["headline"], "left", overrides, keep_alive, run_log)
        touched.add(fid)

    kicker_text = story.get("kicker") or story.get("subhead")
    if module.get("kicker_frame") and kicker_text:
        fid = module["kicker_frame"]
        ok &= _place_text_piece(page, frames, fid, kicker_text, "left", overrides, keep_alive, run_log)
        touched.add(fid)

    for fid, text, align in module.get("extra_text_pieces", []):
        ok &= _place_text_piece(page, frames, fid, text, align, overrides, keep_alive, run_log)
        touched.add(fid)

    body_frame_ids = module.get("body_frames", [])
    if body_frame_ids:
        body_frames_eff = [_resolve_frame(frames, fid, overrides) for fid in body_frame_ids]
        source_font = body_frames_eff[0].get("sourceFont")
        declared_size = body_frames_eff[0].get("fontSizePt")
        if source_font is None:
            run_log.append(("SKIPPED_FRAME", body_frame_ids[0], "frame has no sourceFont in template.json"))
            ok = False
        else:
            try:
                pieces, leftover = flow_story_across_frames(
                    story.get("body_paragraphs", []), body_frames_eff, source_font, declared_size, align="justify")
                if not leftover:
                    merged_frames = _merge_trailing_unused_frames(body_frames_eff, pieces, frames.values())
                    if merged_frames is not None:
                        remerged_pieces, remerged_leftover = flow_story_across_frames(
                            story.get("body_paragraphs", []), merged_frames, source_font, declared_size, align="justify")
                        if not remerged_leftover:
                            pieces, leftover = remerged_pieces, remerged_leftover
                            merged_anchor = merged_frames[-1]
                            geometry_overrides[merged_anchor["id"]] = {
                                "x0": merged_anchor["x0"], "y0": merged_anchor["y0"],
                                "x1": merged_anchor["x1"], "y1": merged_anchor["y1"],
                            }
            except ValueError as e:
                run_log.append(("MISSING_FONT_ASSET", module["id"], str(e)))
                pieces, leftover = [], story.get("body_paragraphs", [])
                ok = False
            for f, path, size, top_off, fit in pieces:
                keep_alive.append(composite_snippet(page, f, path, top_off, fit))
                touched.add(f["id"])
                if fit["shrink_ratio"] < 1.0:
                    run_log.append(("AUTO_SHRUNK", f["id"], f"shrunk to {fit['shrink_ratio']} of calibrated size to fit"))
            if leftover:
                run_log.append(("CONTENT_OVERFLOW", module["id"],
                                 f"{len(leftover)} paragraph(s) did not fit any of this module's "
                                 f"{len(body_frame_ids)} body frames -- needs an editorial trim or a bigger module"))
                ok = False

    photo_frame = module.get("photo_frame")
    if photo_frame and story.get("photo_path"):
        place_photo_cropped(page, frames[photo_frame], story["photo_path"])
    elif photo_frame:
        draw_open_photo_slot(page, frames[photo_frame])

    for fid in module.get("extra_photo_slots", []):
        draw_open_photo_slot(page, _resolve_frame(frames, fid, overrides))

    return ok, touched


def draw_module_open(page, frames, module):
    """No story was left to fill this module today -- honest placeholders
    across every frame it owns, same spirit as content.ts's
    AD_PLACEHOLDER_IDS/OPEN_STORY_SLOT_IDS."""
    for key in ("headline_frame", "kicker_frame"):
        fid = module.get(key)
        if fid:
            draw_open_photo_slot(page, frames[fid], label="STORY SLOT OPEN")
    for fid in module.get("body_frames", []):
        draw_open_photo_slot(page, frames[fid], label="STORY SLOT OPEN")
    for fid, _text, _align in module.get("extra_text_pieces", []):
        draw_open_photo_slot(page, frames[fid], label="STORY SLOT OPEN")
    photo_frame = module.get("photo_frame")
    if photo_frame:
        draw_open_photo_slot(page, frames[photo_frame])
    for fid in module.get("extra_photo_slots", []):
        draw_open_photo_slot(page, frames[fid])


INFEASIBLE_COST = 100_000  # one piece genuinely doesn't fit its frame
OVERFLOW_PARAGRAPH_COST = 50  # per body paragraph that spills past the module's last frame
PHOTO_MATCH_BONUS = 10  # soft preference, not a hard requirement


def _dry_fits(text, frame, source_font, declared_size_pt):
    """Real fit check (same WeasyPrint measurement flow_gujarati_text always
    uses) without keeping the rendered snippet -- used only to score a
    candidate assignment, never to actually composite anything."""
    if source_font is None:
        return False
    try:
        _, _, _, fit = flow_gujarati_text(text, frame, source_font, declared_size_pt, align="left")
        return fit["fits"]
    except ValueError:
        return False


def _pair_cost(story, module, frames):
    """Real, rendered fit cost for placing `story` into `module` -- the
    input to the OR-Tools assignment solver below. Checks the headline and
    kicker EACH against their own specific frame (not an aggregate total --
    see this file's module docstring for why that distinction matters:
    two modules can have near-identical total capacity while their
    individual headline/kicker frames differ a lot), and threads the actual
    body paragraphs through the module's real (override-applied) body
    frames to count genuine overflow. Lower is better; 0 means every piece
    is confirmed to fit as-is."""
    overrides = module.get("frame_overrides", {})
    cost = 0

    hf = module.get("headline_frame")
    if hf and story.get("headline"):
        f = _resolve_frame(frames, hf, overrides)
        if not _dry_fits(story["headline"], f, f.get("sourceFont"), f.get("fontSizePt")):
            cost += INFEASIBLE_COST

    kf = module.get("kicker_frame")
    kicker_text = story.get("kicker") or story.get("subhead")
    if kf and kicker_text:
        f = _resolve_frame(frames, kf, overrides)
        if not _dry_fits(kicker_text, f, f.get("sourceFont"), f.get("fontSizePt")):
            cost += INFEASIBLE_COST

    body_ids = module.get("body_frames", [])
    if body_ids:
        body_frames_eff = [_resolve_frame(frames, fid, overrides) for fid in body_ids]
        source_font = body_frames_eff[0].get("sourceFont")
        if source_font is None:
            cost += INFEASIBLE_COST
        else:
            try:
                _pieces, leftover = flow_story_across_frames(
                    story.get("body_paragraphs", []), body_frames_eff,
                    source_font, body_frames_eff[0].get("fontSizePt"), align="justify")
                cost += OVERFLOW_PARAGRAPH_COST * len(leftover)
            except ValueError:
                cost += INFEASIBLE_COST

    if story.get("photo_path") and module.get("photo_frame"):
        cost -= PHOTO_MATCH_BONUS

    return cost


def assign_stories_to_modules(stories, modules, frames):
    """Optimal assignment via OR-Tools CP-SAT (docs/PRECISION_ROADMAP.md
    Phase 1): the cost matrix comes from _pair_cost's real, rendered
    per-piece fit checks for every (story, module) candidate pair, not a
    cheap aggregate-size heuristic (see this file's module docstring for
    the concrete case -- PM_VISIT/SAMARTH -- where aggregate matching
    placed a story whose kicker didn't fit its assigned module's specific
    kicker frame). The solver maximizes (assignment count, weighted by
    -cost) jointly -- i.e. it always prefers placing every story somewhere
    over leaving one out, and only among full assignments does it minimize
    real fit cost -- so a genuinely awkward day (more/odder stories than
    modules can cleanly fit) still gets every story placed as well as
    possible rather than silently dropped, with any remaining overflow
    still caught by the normal CONTENT_OVERFLOW/NEEDS_REVIEW path at build
    time. Returns (assignments: list[(story, module)], leftover_stories,
    leftover_modules) -- leftovers only happen when one side has literally
    more items than the other."""
    n, m = len(stories), len(modules)
    if n == 0 or m == 0:
        return [], list(stories), list(modules)

    cost = [[_pair_cost(stories[i], modules[j], frames) for j in range(m)] for i in range(n)]

    model = cp_model.CpModel()
    x = {(i, j): model.NewBoolVar(f"x_{i}_{j}") for i in range(n) for j in range(m)}
    for i in range(n):
        model.Add(sum(x[i, j] for j in range(m)) <= 1)
    for j in range(m):
        model.Add(sum(x[i, j] for i in range(n)) <= 1)

    # ASSIGN_BONUS must dominate any real cost difference so the solver
    # always prefers making an assignment over leaving a story/module idle;
    # cost only breaks ties among assignments themselves.
    ASSIGN_BONUS = 1_000_000
    model.Maximize(sum((ASSIGN_BONUS - cost[i][j]) * x[i, j] for i in range(n) for j in range(m)))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    status = solver.Solve(model)

    assignments = []
    assigned_i, assigned_j = set(), set()
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for i in range(n):
            for j in range(m):
                if solver.Value(x[i, j]):
                    assignments.append((stories[i], modules[j]))
                    assigned_i.add(i)
                    assigned_j.add(j)

    leftover_stories = [stories[i] for i in range(n) if i not in assigned_i]
    leftover_modules = [modules[j] for j in range(m) if j not in assigned_j]
    return assignments, leftover_stories, leftover_modules


def run(content_plan, run_name):
    tmpl = json.load(open(f"{ROOT}/web/src/lib/template.json"))
    target = fitz.open(TARGET_PDF)
    keep_alive = []
    run_log = []
    touched_pages = {}  # page_num -> set(frame_ids assigned)
    geometry_overrides = {}  # page_num -> {frame_id: {x0,y0,x1,y1}}, for QA -- see build_module

    for page_num, plan in content_plan.items():
        stories = plan.get("stories", [])
        modules = plan.get("modules", [])
        open_slots = plan.get("open_slots", [])

        page_idx = page_num - 1
        page = target[page_idx]
        frames = {f["id"]: f for f in tmpl["pages"][str(page_num)]["frames"]}
        touched_pages.setdefault(page_num, set())
        geometry_overrides.setdefault(page_num, {})

        if page_num == 1:
            keep_alive.append(build_page1_masthead(page))
        else:
            keep_alive.append(build_running_header(
                page, fitz.open(SRC_PDF), page_idx,
                calibration_ratio_fn=lambda size: size * calibration_ratio("BBharatiGopikaTwo,Bold", size),
            ))

        assignments, leftover_stories, leftover_modules = assign_stories_to_modules(stories, modules, frames)
        # forced_pairs bypass the solver entirely -- for deliberately
        # exercising one failure mode in isolation (--include-overflow-test)
        # without a huge synthetic story's cost distorting the real
        # story/module assignment above.
        assignments = assignments + plan.get("forced_pairs", [])

        for story, module in assignments:
            missing = REQUIRED_STORY_FIELDS - story.keys()
            if missing:
                run_log.append(("SKIPPED_ASSIGNMENT", story.get("id", module["id"]),
                                 f"story missing required fields: {missing}"))
                draw_module_open(page, frames, module)
                continue
            ok, touched = build_module(page, frames, story, module, keep_alive, run_log,
                                        geometry_overrides[page_num])
            touched_pages[page_num].update(touched)

        for story in leftover_stories:
            run_log.append(("SKIPPED_ASSIGNMENT", story.get("id", "?"),
                             "no module left with capacity for this story today"))
        for module in leftover_modules:
            run_log.append(("SKIPPED_ASSIGNMENT", module["id"], "no story left to fill this module today"))
            draw_module_open(page, frames, module)
        # placeholder frames (open modules, open_photo_slots, headline/body
        # frames a short story never reached) are deliberately excluded from
        # the QA scope below -- a placeholder's fixed-size label text or its
        # absence has nothing meaningful to check against a frame's
        # calibrated size (matches build_page1_full.py's original "scoped
        # past p1-42/p1-43" precedent).

        for fid, label in open_slots:
            draw_open_photo_slot(page, frames[fid], **({"label": label} if label else {}))

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
        results, counts = verify_page.verify(staged_path, page_num, only_frame_ids=frame_ids,
                                              geometry_overrides=geometry_overrides.get(page_num))
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

    STORY_SAMARTH = {
        "id": "samarth",
        "kicker": "₹190 કરોડનો પ્રોજેક્ટ, 10,000ને તાલીમ",
        "headline": "IITGNમાં સેમિકન્ડક્ટર તાલીમ હબ 'સામર્થ્ય'નો પ્રારંભ",
        "body_paragraphs": [
            "ગાંધીનગર: IIT ગાંધીનગર ખાતે શનિવારે 'સામર્થ્ય' (સિલિકોન એન્ડ એડવાન્સ્ડ સેમિકન્ડક્ટર "
            "મેન્યુફેક્ચરિંગ રિસર્ચ એન્ડ ટ્રેનિંગ હબ) પ્રોજેક્ટની પૂર્વ-શુભારંભ બેઠક યોજાઈ હતી.",
            "ગુજરાતની વિવિધ યુનિવર્સિટીઓ અને એન્જિનિયરિંગ સંસ્થાઓના પ્રતિનિધિઓએ બેઠકમાં ભાગ લઈ "
            "અભ્યાસક્રમ, તાલીમ અને સંશોધન સહયોગ અંગે પોતાના મંતવ્યો રજૂ કર્યા હતા.",
            "ઇલેક્ટ્રોનિક્સ અને ઇન્ફોર્મેશન ટેકનોલોજી મંત્રાલય, ગુજરાત સરકાર અને IITGN ના સંયુક્ત આ "
            "પ્રોજેક્ટ હેઠળ આગામી પાંચ વર્ષમાં 10,000થી વધુ વિદ્યાર્થીઓ-ટેકનિશિયનોને તાલીમ તેમજ "
            "1,000થી વધુ ઉદ્યોગ વ્યાવસાયિકોને અપસ્કિલ કરાશે.",
            "સંસ્થાના ડિરેક્ટર પ્રો. રજત મૂનાએ જણાવ્યું કે સેમિકન્ડક્ટર ક્ષેત્રે કુશળ માનવબળ તૈયાર "
            "કરવું એ ભારતની સ્પર્ધાત્મકતા માટે અનિવાર્ય છે.",
        ],
        # Real photo from the same PIB press release this story is sourced
        # from (https://www.pib.gov.in/PressReleasePage.aspx?PRID=2297007) --
        # SAMARTH's own module has no photo_frame in the source grid, so the
        # assignment solver's photo-match bonus (_pair_cost) decides which
        # photo-capable module actually gets to use it, not a hardcoded slot.
        "photo_path": f"{ROOT}/web/public/photos/samarth1.jpg",
    }
    STORY_PRAG = {
        "id": "prag",
        "headline": "IIT ગાંધીનગર દ્વારા નીતિ-સંશોધન માટે 'પ્રાગ' પહેલનો પ્રારંભ",
        "subhead": "ટેકનોલોજી અને શાસનના સંગમ પર નિષ્ણાતોની ચર્ચા, ભૂતપૂર્વ મુખ્ય સચિવો પણ જોડાયા",
        "body_paragraphs": [
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
    STORY_NIFT = {
        "id": "nift",
        "subhead": "ITI તાલીમાર્થીઓ માટે નવો યુનિફોર્મ, વિજેતા ટીમને ₹1 લાખનું ઇનામ",
        "headline": "NIFT ગાંધીનગર ખાતે 24 કલાકની યુનિફોર્મ ડિઝાઇન હેકાથોન",
        "body_paragraphs": [
            "ગાંધીનગર: NIFT ગાંધીનગર અને ગુજરાત સરકારના રોજગાર અને તાલીમ નિયામકની કચેરીના સંયુક્ત "
            "ઉપક્રમે 'યુનિફોર્મ ડિઝાઇન હેકાથોન 2026'નો પ્રારંભ NIFT કેમ્પસ ખાતે થયો હતો.",
            "NIFT ગાંધીનગર અને ગુજરાત યુનિવર્સિટીની કુલ ચાર વિદ્યાર્થી ટીમો રાજ્યની સરકારી ITI "
            "સંસ્થાઓ માટે કાર્યક્ષમ અને પોસાય તેવા યુનિફોર્મ ડિઝાઇન કરવા 24 કલાક સતત કામ કરી રહી છે.",
            "વિજેતા ડિઝાઇનનો ખર્ચ પ્રતિ યુનિફોર્મ ₹1,000થી વધુ ન હોવો જોઈએ. પ્રથમ ટીમને ₹50,000, "
            "બીજીને ₹30,000 અને ત્રીજીને ₹20,000નું ઇનામ અપાશે.",
        ],
    }
    STORY_PM_VISIT = {
        "id": "pm_visit",
        "kicker": "25-26 ઓગસ્ટે અમદાવાદમાં ₹5,400 કરોડના વિકાસ પ્રોજેક્ટ્સનું લોકાર્પણ",
        "headline": "વડાપ્રધાન મોદી 25-26 ઓગસ્ટે ગુજરાતની મુલાકાતે",
        "body_paragraphs": [
            "અમદાવાદ: વડાપ્રધાન નરેન્દ્ર મોદી 25-26 ઓગસ્ટના રોજ ગુજરાતની મુલાકાતે આવશે. તેઓ 25 "
            "ઓગસ્ટે સાંજે ખોડલધામ મેદાન, અમદાવાદ ખાતે ₹5,400 કરોડથી વધુના વિવિધ વિકાસ પ્રોજેક્ટ્સનું "
            "લોકાર્પણ અને શિલાન્યાસ કરશે.",
            "26 ઓગસ્ટે તેઓ હાંસલપુર ખાતે સુઝુકીની પ્રથમ ગ્લોબલ બેટરી ઇલેક્ટ્રિક વ્હીકલ 'e VITARA'ને "
            "100થી વધુ દેશોમાં નિકાસ માટે લીલી ઝંડી આપશે તેમજ હાઇબ્રિડ બેટરી ઇલેક્ટ્રોડના સ્થાનિક "
            "ઉત્પાદનનું ઉદ્ઘાટન કરશે.",
            "કાર્યક્રમમાં ₹1,400 કરોડથી વધુના રેલવે પ્રોજેક્ટ્સ પણ રાષ્ટ્રને અર્પણ કરાશે, જેમાં "
            "મહેસાણા-પાલનપુર રેલ લાઇનનું બમણું કરણ અને કલોલ-કડી-કટોસણ તથા બેચરાજી-રાણુજ લાઇનનું "
            "ગેજ પરિવર્તન સામેલ છે.",
            "વિરમગામ-ખુડદ-રામપુરા રોડના પહોળાઈકરણનું ઉદ્ઘાટન તેમજ અમદાવાદ નજીક છ-લેન અંડરપાસના "
            "નિર્માણનું ખાતમુહૂર્ત પણ કરાશે.",
        ],
    }

    UPI_EYEBROW = "ડિજિટલ ક્રાંતિ"
    UPI_HEADLINE = "UPIના 10 વર્ષ પૂર્ણ"
    STORY_UPI = {
        "id": "upi",
        "kicker": UPI_EYEBROW,
        "headline": UPI_HEADLINE,
        "body_paragraphs": [
            "નવી દિલ્હી: રિઝર્વ બેંક ઓફ ઇન્ડિયા (RBI)ની દેખરેખ હેઠળ નેશનલ પેમેન્ટ્સ કોર્પોરેશન ઓફ "
            "ઇન્ડિયા (NPCI) દ્વારા 25 ઓગસ્ટ, 2016ના રોજ શરૂ કરાયેલ યુનિફાઇડ પેમેન્ટ્સ ઇન્ટરફેસ (UPI)એ "
            "ડિજિટલ પેમેન્ટ ક્રાંતિના 10 વર્ષ પૂર્ણ કર્યા છે.",
            "વાર્ષિક ટ્રાન્ઝેક્શન વોલ્યુમ નાણાકીય વર્ષ 2016-17માં માત્ર 1.78 કરોડથી વધીને 2025-26માં "
            "24,162 કરોડથી વધુ થયું છે, જે લગભગ 13,000 ગણો વધારો દર્શાવે છે.",
            "ટ્રાન્ઝેક્શન મૂલ્ય પણ ₹0.07 લાખ કરોડથી વધીને લગભગ ₹314 લાખ કરોડ થયું છે, જે 4,000 "
            "ગણાથી વધુના ઉછાળા સમાન છે.",
            "UPI હાલમાં 11 દેશોમાં કાર્યરત છે અને ક્રોસ-બોર્ડર ડિજિટલ પેમેન્ટ્સ માટે વૈશ્વિક પ્લેટફોર્મ "
            "તરીકે ઉભરી આવ્યું છે. UPI સાથે જોડાયેલી બેંકોની સંખ્યા 44થી વધીને 703 થઈ છે.",
            "આંતરરાષ્ટ્રીય નાણાકીય ભંડોળ (IMF)એ UPIને ટ્રાન્ઝેક્શન વોલ્યુમની દૃષ્ટિએ વિશ્વની સૌથી "
            "મોટી રિયલ-ટાઇમ પેમેન્ટ સિસ્ટમ તરીકે માન્યતા આપી છે.",
            "નિષ્ણાતોના મતે, UPIની સફળતા સ્કેલેબલ અને સર્વસમાવેશક ડિજિટલ પબ્લિક ઇન્ફ્રાસ્ટ્રક્ચરના "
            "નિર્માણમાં ભારતના નેતૃત્વને રેખાંકિત કરે છે.",
        ],
        # Real chart from the same PIB release (transaction-volume growth,
        # PRID 2302670) -- a data graphic, not a photojournalism image, but
        # appropriate for a data-driven economic anniversary story and
        # sourced from the same official release the story text is based on.
        "photo_path": f"{ROOT}/web/public/photos/upi_chart.png",
    }

    STORY_RBI = {
        "id": "rbi",
        "headline": "RBIની ફોરેક્સ સ્વેપ યોજના",  # a real, usable headline -- but whether it
        # actually gets PLACED anywhere now depends on which module the
        # solver assigns this story to (some modules have no distinct
        # headline frame, some do); this field is no longer tied to one
        # hardcoded frame the way it was before Phase 1.
        "body_paragraphs": [
            "નવી દિલ્હી: રિઝર્વ બેંક ઓફ ઇન્ડિયા (RBI)ની ખાસ USD-INR ફોરેક્સ સ્વેપ સુવિધાએ દેશમાં "
            "વિદેશી હૂંડિયામણના પ્રવાહમાં અભૂતપૂર્વ ઉછાળો નોંધાવ્યો છે.",
            "8 જૂન, 2026ના રોજ શરૂ કરાયેલી આ યોજના હેઠળ 21 ઓગસ્ટ સુધીમાં કુલ 73 અબજ ડોલરનો પ્રવાહ "
            "એકત્ર થયો છે, જેમાં FCNR(B) થાપણોનો હિસ્સો 65.40 અબજ ડોલર છે.",
            "અગિયાર સપ્તાહથી ઓછા સમયમાં આ આંકડો હાંસલ કરીને, આ કવાયતે 2013ની RBIની અગાઉની યોજના "
            "(લગભગ ત્રણ મહિનામાં 26 અબજ ડોલર)ની ઝડપ અને વ્યાપ્તિને પાછળ છોડી દીધી છે.",
            "પ્રતિસાદ એટલો મજબૂત રહ્યો કે RBIએ FCNR(B) વિન્ડો બંધ કરવાની તારીખ 30 સપ્ટેમ્બરથી વહેલી "
            "કરીને 31 ઓગસ્ટ કરી દીધી છે.",
        ],
    }

    BHAVNAGAR_BODY = [
        "ભાવનગર: શહેરમાં ભેળસેળયુક્ત આલ્કોહોલના સેવનથી સર્જાયેલી ગંભીર ઘટનાને પગલે કેન્દ્રીય "
        "રાજ્ય મંત્રી શ્રીમતી નિમુબેન બાંભણિયાએ સર ટી હોસ્પિટલની મુલાકાત લઈને જિલ્લા અધિકારીઓ "
        "સાથે ઉચ્ચસ્તરીય બેઠક યોજી હતી.",
        "મંત્રીશ્રીએ જણાવ્યું કે અત્યાર સુધીમાં 44 અસરગ્રસ્તો હોસ્પિટલમાં દાખલ થયા હતા, જે પૈકી "
        "29 ડિસ્ચાર્જ થયા છે અને દુ:ખદ રીતે 13 વ્યક્તિઓનાં મૃત્યુ થયાં છે, જ્યારે બે અસરગ્રસ્તોની "
        "સારવાર હજુ ચાલુ છે.",
        "પોલીસ તંત્ર અને એસ.એમ.સી. આ ઘટનાની તપાસ કરી રહ્યાં છે. નાયબ મુખ્યમંત્રી શ્રી હર્ષભાઈ "
        "સંઘવીએ ઘટનાના દિવસે જ તપાસ એસ.એમ.સી.ને સોંપી હતી.",
        "સર ટી હોસ્પિટલમાં દાખલ દર્દીઓ માટે ડાયાલિસિસ સહિતની સારવાર માટે ડોકટરોની ટીમ કાર્યરત "
        "છે. જરૂરી ઇન્જેક્શનોની વ્યવસ્થા મહારાષ્ટ્રથી કરવામાં આવી હતી.",
        "બેઠકમાં જિલ્લા કલેક્ટર ડૉ. મનીષકુમાર બંસલ, જિલ્લા વિકાસ અધિકારી શ્રી હનુલ ચૌધરી, પોલીસ "
        "અધિક્ષક શ્રી નીતેશ પાંડેય સહિતના અધિકારીઓ ઉપસ્થિત રહ્યા હતા.",
    ]
    STORY_BHAVNAGAR = {"id": "bhavnagar", "headline": BHAVNAGAR_BODY[0], "body_paragraphs": BHAVNAGAR_BODY}

    AADHAAR_BODY = [
        "દીવ: યુનિક આઇડેન્ટિફિકેશન ઓથોરિટી ઓફ ઇન્ડિયા (UIDAI)ની મુંબઈ પ્રાદેશિક કચેરી દ્વારા "
        "દીવ ખાતે આધાર નોંધણી અને અપડેટ ઈકોસિસ્ટમ પર વિશેષ તાલીમ કાર્યક્રમ યોજાયો હતો.",
        "24 ઓગસ્ટે યોજાયેલી આ તાલીમમાં જૂનાગઢ, અમરેલી, ગીર-સોમનાથ અને ભાવનગરના 60થી વધુ "
        "ઓપરેટરોએ ભાગ લીધો હતો.",
        "કાર્યક્રમનું ઉદ્ઘાટન SDM શ્રી શિવમ મિશ્રા દ્વારા કરાયું. તાલીમમાં નવા ક્લાયન્ટ ફીચર્સ "
        "અને દસ્તાવેજોની યાદી આવરી લેવાઈ.",
        "કાર્યક્રમમાં પ્રશ્ન-જવાબ સત્ર પણ યોજાયું. સમાપન BDO દીવ શ્રી જિતેન્દ્ર વાળાના "
        "આભારવિધિ સાથે થયું.",
    ]
    STORY_AADHAAR = {"id": "aadhaar", "headline": AADHAAR_BODY[0], "body_paragraphs": AADHAAR_BODY}

    STORY_CBI_BRIBERY = {
        "id": "cbi",
        "kicker": "CBI કોર્ટ, અમદાવાદનો ચુકાદો; 2013ના ટ્રેપ કેસમાં 13 વર્ષે સજા",
        "headline": "લાંચ કેસમાં આવકવેરા અધિકારીને ત્રણ વર્ષની જેલ",
        "body_paragraphs": [
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

    # ---- MODULES: the physical frame groups the fixed grid actually offers
    # on each page (see docs/PRECISION_ROADMAP.md's Phase 10 -- the GRID
    # itself stays fixed; only which story fills which module, and how many
    # of its frames a story's body actually uses, is now computed). Geometric
    # frame_overrides stay attached to the MODULE (a property of that
    # specific frame group's real, measured collisions), independent of
    # whichever story assignment lands on it. ----
    PAGE1_MODULES = [
        {
            "id": "p1-m-samarth-slot", "headline_frame": "p1-13", "kicker_frame": "p1-11",
            "body_frames": ["p1-14", "p1-17", "p1-18", "p1-19"],
            # this module's headline wraps to 2 lines and genuinely overlaps
            # its own first body frame by 66pt in y -- found by rendering
            # (see the "Two more real defects" roadmap entry).
            "frame_overrides": {"p1-14": lambda frames: {"y0": frames["p1-13"]["y1"] + 5.0}},
        },
        {
            "id": "p1-m-prag-slot", "headline_frame": "p1-12", "kicker_frame": "p1-21",
            "body_frames": ["p1-20", "p1-22", "p1-23", "p1-24"], "photo_frame": "p1-15",
            # p1-15/p1-16 (two photo frames) overlap by 22.6pt at their shared
            # edge -- inset p1-16's left edge to where p1-15 actually ends.
            "extra_photo_slots": ["p1-16"],
            "frame_overrides": {"p1-16": lambda frames: {"x0": frames["p1-15"]["x1"]}},
        },
        {
            "id": "p1-m-nift-slot", "headline_frame": "p1-25", "kicker_frame": "p1-28",
            "body_frames": ["p1-35", "p1-36", "p1-37"],
            # p1-30 is a real usable photo_frame -- promoted from an
            # always-open extra so the assignment solver can actually place
            # a photo-bearing story's real image here, not just NIFT's own
            # (which never got one). p1-34 stays a secondary open slot.
            "photo_frame": "p1-30", "extra_photo_slots": ["p1-34"],
        },
        {
            "id": "p1-m-pmvisit-slot", "headline_frame": "p1-27", "kicker_frame": "p1-26",
            "body_frames": ["p1-29", "p1-31", "p1-32", "p1-33"],
            # this module's full-width headline genuinely overlaps 3 of its
            # own 4 body frames -- clip each to start below the headline's
            # actual bottom edge (only where it would otherwise overlap).
            "frame_overrides": {
                fid: (lambda frames, fid=fid: (
                    {"y0": frames["p1-27"]["y1"] + 5.0}
                    if frames[fid]["y0"] < frames["p1-27"]["y1"] else {}
                ))
                for fid in ("p1-29", "p1-31", "p1-32", "p1-33")
            },
        },
    ]

    PAGE2_MODULES = [
        {
            "id": "p2-m-upi-slot", "headline_frame": "p2-9", "kicker_frame": "p2-8",
            "body_frames": ["p2-10"], "photo_frame": "p2-13",
            "extra_text_pieces": [("p2-7", "UPI @ 10", "left")],
        },
        {
            "id": "p2-m-rbi-slot",  # no distinct headline frame in this module --
            # the source grid's first body frame IS the lede, same as the
            # original render.
            "body_frames": ["p2-12", "p2-15", "p2-16"], "photo_frame": "p2-14",
        },
        {
            "id": "p2-m-bhavnagar-slot", "body_frames": ["p2-11"], "photo_frame": "p2-19",
            # p2-11 genuinely overlaps p2-12, p2-14, AND p2-19 (own module's
            # photo) -- clipped to the largest conflict-free sub-rectangle,
            # with the grid's own gutter for breathing room.
            "frame_overrides": {
                "p2-11": lambda frames: {
                    "x1": frames["p2-14"]["x0"] - 11.884,
                    "y1": frames["p2-14"]["y0"],
                },
            },
        },
        {
            "id": "p2-m-aadhaar-slot", "body_frames": ["p2-17", "p2-20", "p2-21", "p2-22"],
            "photo_frame": "p2-18",
        },
        {
            "id": "p2-m-cbi-slot", "headline_frame": "p2-23", "kicker_frame": "p2-26",
            "body_frames": ["p2-24", "p2-25", "p2-27", "p2-28"],
        },
    ]

    content_plan = {
        1: {
            "stories": [STORY_SAMARTH, STORY_PRAG, STORY_NIFT, STORY_PM_VISIT],
            "modules": PAGE1_MODULES,
            # ad box (p1-39/40) and open story slots (p1-42/43) per content.ts's
            # own AD_PLACEHOLDER_IDS/OPEN_STORY_SLOT_IDS classification --
            # honest placeholders, not a gap to second-guess, and not part of
            # any module since no story is meant to fill them.
            "open_slots": [
                ("p1-38", None), ("p1-41", None),
                ("p1-42", "STORY SLOT OPEN"), ("p1-43", "STORY SLOT OPEN"),
            ],
        },
        2: {
            "stories": [STORY_UPI, STORY_RBI, STORY_BHAVNAGAR, STORY_AADHAAR, STORY_CBI_BRIBERY],
            "modules": PAGE2_MODULES,
            # p2-6's bbox (x:15-275, y:46-816) is a superset bounding box
            # around the entire UPI module (p2-8/p2-9/p2-10 all nest inside
            # it) -- a duplicate coarse capture from template extraction, not
            # a separate "editorial column" slot. Confirmed by rendering:
            # drawing a placeholder there printed directly over the real UPI
            # headline. Left undrawn.
            "open_slots": [],
        },
    }

    if args.include_overflow_test:
        # deliberately far too long for a single 62pt-tall column -- proves
        # the NEEDS_REVIEW path actually triggers rather than assuming it
        # would. Passed as a forced_pair, bypassing greedy assignment
        # entirely -- appending it to the real story/module pools would let
        # a huge synthetic story's size hijack the largest-to-largest match
        # and corrupt the real assignment this test should leave alone.
        # Isolates the one failure mode this test exists to prove, same as
        # the original test's intent.
        oversized_story = {
            "id": "overflow-test", "headline": "ટેસ્ટ ઓવરફ્લો સ્ટોરી",
            "body_paragraphs": [
                "આ એક ખૂબ લાંબો ફકરો છે જે ફ્રેમમાં સમાતો નથી અને ઓવરફ્લો થાય છે. " * 20,
            ],
        }
        oversized_module = {"id": "page2-overflow-test-module", "body_frames": ["p2-15"]}
        content_plan[2]["forced_pairs"] = [(oversized_story, oversized_module)]

    run_name = "daily_2026-08-25_overflow-test" if args.include_overflow_test else "daily_2026-08-25"
    status = run(content_plan, run_name=run_name)
    sys.exit(0 if status == "READY" else 1)
