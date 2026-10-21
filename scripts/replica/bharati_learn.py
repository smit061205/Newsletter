#!/usr/bin/env python3
"""Learn how the paper's own typesetters encode each Gujarati syllable in the
legacy Bharati Gopika fonts, from "(196) Capital Kranti_08 august.pdf".

Every legacy span is cut into syllable chunks (the same structure
bharati_decode.decode() reads: a pre-base i, a consonant cluster, its signs,
nasal and reph); each chunk is decoded on its own, and the chunk's codes are
recorded for that Unicode syllable. The encoder (backend/src/fonts/bharati.ts)
uses the most frequent spelling of a syllable first, and the decoder's own
rules, run backwards, for syllables the paper never printed.

Writes publications/capital-kranti/fonts/bharati.json:
  table      code -> [kind, unicode]   (the decoder's table, for the rules)
  syllables  unicode syllable -> legacy codes (most frequent), with counts
  checks     how well the chunking reproduces the decoder on every span
"""
import collections
import json
import os
import sys

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from bharati_decode import (CONS, HALF, MOD, NAS, OTHER, PRE, REPH, SIGN, STEM, T, VOWEL,  # noqa: E402
                            YA, decode, is_legacy)

SRC = os.path.join(ROOT, "(196) Capital Kranti_08 august.pdf")
OUT = os.path.join(ROOT, "publications", "capital-kranti", "fonts", "bharati.json")
KINDS = {HALF: "half", CONS: "cons", YA: "ya", STEM: "stem", MOD: "mod", SIGN: "sign", NAS: "nas",
         VOWEL: "vowel", REPH: "reph", PRE: "pre", OTHER: "other"}


def chunks(legacy):
    """Cut a legacy string into syllable chunks."""
    out, cur, open_, has_base = [], "", False, False
    for ch in legacy:
        kind = T.get(ch, (OTHER, None))[0]
        if ch == "<":
            kind = CONS
        starts = False
        if kind == PRE:
            starts = True
        elif kind in (HALF, CONS):
            starts = has_base and not open_
        elif kind in (VOWEL, OTHER):
            starts = True
        elif kind == YA:
            starts = not has_base
        if starts and cur and not (cur and all(T.get(c, (OTHER,))[0] == PRE for c in cur) and kind in (HALF, CONS)):
            out.append(cur)
            cur, open_, has_base = "", False, False
        cur += ch
        if kind in (HALF, CONS, VOWEL, YA):
            has_base = True
        if kind == HALF:
            open_ = True
        elif kind == CONS or kind == YA:
            open_ = False
        elif kind == STEM and open_:
            open_ = False
        elif kind == MOD:
            open_ = T[ch][1] == "્"
        if kind == OTHER:
            out.append(cur)
            cur, open_, has_base = "", False, False
    if cur:
        out.append(cur)
    return out


def main():
    doc = fitz.open(SRC)
    seen = collections.defaultdict(collections.Counter)
    spans = ok = 0
    for page in doc:
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    if not is_legacy(s["font"]) or not s["text"].strip():
                        continue
                    spans += 1
                    whole = decode(s["text"])[0]
                    parts = chunks(s["text"])
                    if "".join(decode(c)[0] for c in parts) == whole:
                        ok += 1
                        for c in parts:
                            u = decode(c)[0]
                            if u.strip() and any("઀" <= x <= "૿" for x in u):
                                seen[u][c] += 1
    syll = {u: {"codes": c.most_common(1)[0][0], "count": sum(c.values()),
                **({"alternatives": dict(c.most_common()[1:])} if len(c) > 1 else {})}
            for u, c in sorted(seen.items())}
    table = {code: [KINDS[kind], val if isinstance(val, str) else list(val)] for code, (kind, val) in T.items()}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"table": table, "syllables": syll,
               "checks": {"spans": spans, "chunked_exactly": ok}}, open(OUT, "w"), ensure_ascii=False, indent=0)
    print(f"{spans} legacy spans, {ok} chunked exactly ({ok / spans:.1%}); {len(syll)} distinct syllables "
          f"({sum(1 for v in syll.values() if 'alternatives' in v)} spelled more than one way) -> {OUT}")


if __name__ == "__main__":
    main()
