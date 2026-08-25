#!/usr/bin/env python3
"""Shared canonical coordinate transform (issue-space -> blank-master space),
generalized to all 4 pages. Previously each script (audit_page.py,
build_header_v2.py) hardcoded its own copy; build_header_v2.py's copy only
ever supported page 0 (Y_OFFSET_P1). Centralized here so every future script
uses the one confirmed transform instead of a fork that could silently drift.

Per-page Y_OFFSET values confirmed in Phase 1 (docs/PRECISION_ROADMAP.md):
each derived from that page's own topmost drawn rect, cross-verified against
template.json's existing frame positions to within 0.01pt.
"""
ISSUE_ORIGIN, ISSUE_PITCH = 14.2076, 136.1467
CANON_ORIGIN, CANON_PITCH = 15.51, 136.084
SCALE = CANON_PITCH / ISSUE_PITCH
Y_OFFSET = {0: -3.164, 1: -2.133, 2: -2.133, 3: -2.616}


def tx(x):
    return CANON_ORIGIN + (x - ISSUE_ORIGIN) * SCALE


def ty(y, page_idx=0):
    return y + Y_OFFSET[page_idx]


def canon_rect(x0, y0, x1, y1, page_idx=0):
    import fitz
    return fitz.Rect(tx(x0), ty(y0, page_idx), tx(x1), ty(y1, page_idx))
