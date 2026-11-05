# The Urdu paper's Nastaliq: static instances (400, 600, 700) of Noto Nastaliq
# Urdu's variable font, with
#  - a wider word space (the font's own is 0.132 em, about as wide as the gap
#    after a letter that doesn't join forward: words ran together), and
#  - the widths of glyphs whose bold grows far past their ink mended (the
#    variable font's own fault: HehDoIni.outD2Y is 666 wide at 400, 1500 at
#    700 with its ink ending at 731, so bold "گاندھی" read "گاند ھی").
# PDFs keep a static font as a font (Chromium writes the variable one as Type 3).
# Made once; the variable original stays beside them as their source:
#   python3 scripts/urdu-fonts.py publications/edition-ur/fonts/NotoNastaliqUrdu.ttf publications/edition-ur/fonts 240
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.boundsPen import BoundsPen

src, out, space = sys.argv[1], sys.argv[2], int(sys.argv[3])

def right_edges(font):
    gs = font.getGlyphSet()
    edges = {}
    for g in font.getGlyphOrder():
        p = BoundsPen(gs)
        gs[g].draw(p)
        edges[g] = p.bounds[2] if p.bounds else None
    return edges

regular = None
for wght, style in ((400, "Regular"), (600, "SemiBold"), (700, "Bold")):
    s = instancer.instantiateVariableFont(TTFont(src), {"wght": wght}, updateFontNames=True)
    edges = right_edges(s)
    if regular is None:
        regular = (dict(s["hmtx"].metrics), edges)
    else:
        adv0, edge0 = regular
        for g, (adv, lsb) in list(s["hmtx"].metrics.items()):
            if edges[g] is None or edge0[g] is None or adv0[g][0] == 0:
                continue
            # the space after the ink, as at the regular weight, past 200 units more: the font's fault
            room = adv0[g][0] - edge0[g]
            if adv - edges[g] > room + 200:
                s["hmtx"][g] = (round(edges[g] + room), lsb)
                print(f"  {style}: {g} {adv} -> {s['hmtx'][g][0]}")
    cmap = s.getBestCmap()
    for cp in (0x20, 0xA0):
        if cp in cmap:
            g = cmap[cp]
            s["hmtx"][g] = (space, s["hmtx"][g][1])
    path = f"{out}/NotoNastaliqUrdu-{style}.ttf"
    s.save(path)
    print(path)
