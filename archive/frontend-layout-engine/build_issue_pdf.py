#!/usr/bin/env python3
"""Print-ready PDF for one issue (the website's "Download print-ready PDF").

A thin wrapper: all layout lives in scripts/layout/engine.py, the same
engine the website's pages are drawn from, so the PDF and the website can't
disagree. This fetches the issue from the app's own /api/issue (already
Zod-validated), lays it out, prints each page's HTML with WeasyPrint on top
of the vector-copied masthead / running-header / footer art, and reports any
overflow or underflow the engine flagged.

Usage:
    python3 scripts/build_issue_pdf.py [--url URL | --issue-json PATH] [--out PATH]
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "layout"))
from engine import ROOT, compose_pdf, load_issue, resolve_issue  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:3000/api/issue")
    ap.add_argument("--issue-json")
    ap.add_argument("--out", default=os.path.join(ROOT, "out", "issue.pdf"))
    args = ap.parse_args()

    issue = load_issue(args.url, args.issue_json)
    out_dir = resolve_issue(issue, os.path.join(ROOT, "out", "engine"))
    compose_pdf(out_dir, args.out)
    warnings = json.load(open(os.path.join(out_dir, "warnings.json")))
    print(f"wrote {args.out} ({issue['pages']} page(s), {len(issue['articles'])} article(s))")
    if warnings:
        print(f"\n{len(warnings)} warning(s) -- review before treating this as print-ready:")
        for w in warnings:
            print(f"  - {w['id']}: {w['kind']} -- {w['detail']}")


if __name__ == "__main__":
    main()
