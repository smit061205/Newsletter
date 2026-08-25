#!/usr/bin/env python3
"""Writes the review manifest + page images that the Next.js review UI
(web/src/app/review/) reads. Kept separate from daily_build.py's own
orchestration logic -- this is presentation/reporting, not pipeline logic.

Deliberately renders page images and a JSON manifest at build time rather
than shipping a PDF.js viewer to the browser: the review surface only ever
needs to show what a specific run already produced, not arbitrary PDFs, so
a static image + structured JSON is simpler and has nothing to go wrong
client-side.
"""
import os
import json
import subprocess
import datetime

ROOT = "/Users/smitthakkar/NewsPaper_Project"
REVIEW_PUBLIC_DIR = f"{ROOT}/web/public/review"
REVIEW_INDEX_PATH = f"{REVIEW_PUBLIC_DIR}/index.json"


def render_page_png(pdf_path, pdf_page_num, out_path, dpi=150):
    """Renders one 1-indexed page of pdf_path to out_path (without extension
    -- pdftoppm appends -N.png) via poppler's pdftoppm, the same tool used
    for every visual check throughout this project."""
    out_prefix = out_path[:-4] if out_path.endswith(".png") else out_path
    subprocess.run(
        ["pdftoppm", "-png", "-r", str(dpi), "-f", str(pdf_page_num), "-l", str(pdf_page_num),
         pdf_path, out_prefix],
        check=True, capture_output=True,
    )
    produced = f"{out_prefix}-{pdf_page_num}.png"
    if os.path.exists(produced):
        os.replace(produced, out_path)


def write_manifest(run_name, status, pdf_path, touched_pages, all_qa_results, run_log):
    """touched_pages: {page_num: set(frame_ids)}. all_qa_results: list of
    (page_num, results, counts) from verify_page.verify(). run_log: list of
    (kind, frame_id, message) from daily_build.build_story()."""
    run_dir = f"{REVIEW_PUBLIC_DIR}/{run_name}"
    os.makedirs(run_dir, exist_ok=True)

    qa_by_page = {p: (results, counts) for p, results, counts in all_qa_results}

    pages_out = []
    for page_num in sorted(touched_pages.keys()):
        if not touched_pages[page_num]:
            continue
        img_name = f"page-{page_num}.png"
        render_page_png(pdf_path, page_num, f"{run_dir}/{img_name}")
        results, counts = qa_by_page.get(page_num, ([], {"PASS": 0, "FAIL": 0, "WARN": 0, "NOT_BUILT": 0}))
        frame_results = [
            {"status": s, "frameId": fid, "message": msg}
            for s, fid, msg, delta in results
        ]
        pages_out.append({
            "pageNum": page_num,
            "image": f"/review/{run_name}/{img_name}",
            "counts": counts,
            "frameResults": frame_results,
        })

    log_out = [{"kind": kind, "frameId": fid, "message": msg} for kind, fid, msg in run_log]

    manifest = {
        "runName": run_name,
        "status": status,
        "builtAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "pdfPath": pdf_path,
        "runLog": log_out,
        "pages": pages_out,
    }
    with open(f"{run_dir}/manifest.json", "w") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)

    # index.json lists every run, newest first, so the review UI can offer a
    # picker without scanning the filesystem itself
    index = []
    if os.path.exists(REVIEW_INDEX_PATH):
        index = json.load(open(REVIEW_INDEX_PATH))
    index = [e for e in index if e["runName"] != run_name]
    index.insert(0, {"runName": run_name, "status": status, "builtAt": manifest["builtAt"]})
    os.makedirs(REVIEW_PUBLIC_DIR, exist_ok=True)
    with open(REVIEW_INDEX_PATH, "w") as fh:
        json.dump(index, fh, indent=2, ensure_ascii=False)

    return f"{run_dir}/manifest.json"
