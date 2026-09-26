#!/usr/bin/env python3
"""Decode the legacy (pre-Unicode) Bharati Gujarati text in
"(196) Capital Kranti_08 august.pdf" into real Unicode Gujarati.

The paper is set in BBharatiGopikaTwo / ,Bold / BBharatiMaruti /
BBharatiTitleTwo -- symbol-encoded fonts where each byte is a glyph shape,
not a letter, stored in visual order. The fonts' glyph names are generic
(uniF0xx) and the PDF's ToUnicode just echoes the bytes, so there is no
mapping to extract. The table below was built by rendering every one of the
142 codes in use from the embedded font, and resolving the ambiguous ones by
cropping real words containing them off the page and reading them (e.g.
`L` is ન્ from નરેન્દ્ર / હેન્ડલુમ, `º` is ત્ર from યાત્રા).

The encoding's structure (confirmed on the masthead's own "furÃkx÷ ¢ktrík"
= કેપિટલ ક્રાંતિ):
  - full consonants are single codes (f=ક, h=ર, ...), some only exist as a
    half form, and half + `k` (the stem) = the full consonant (Ã k = પ);
  - otherwise `k` is the ા sign; ા+ે = ો, ા+ૈ = ૌ;
  - the i-sign (r, Â, ...) is typed BEFORE the consonant it follows;
  - the reph (o) is typed AFTER the syllable it sits on;
  - `y` is અ, and અ + signs composes the independent vowels (આ, એ, ઓ, ઐ, ઔ).
"""
import re

# kind, value
HALF, CONS, YA, STEM, MOD, SIGN, NAS, VOWEL, REPH, PRE, OTHER = range(11)

T = {
    # full consonants and conjunct ligatures
    "f": (CONS, "ક"), "¾": (CONS, "ખ"), "„": (CONS, "ગ"), "½": (CONS, "ઘ"),
    "[": (CONS, "ચ"), "A": (CONS, "છ"), "s": (CONS, "જ"), "Í": (CONS, "ઝ"), "C": (CONS, "ઝ"),
    "x": (CONS, "ટ"), "X": (CONS, "ઠ"), "z": (CONS, "ડ"), "Z": (CONS, "ઢ"), "ý": (CONS, "ણ"),
    "Œ": (CONS, "ત"), "Ë": (CONS, "દ"), "Ä": (CONS, "ધ"), "™": (CONS, "ન"),
    "…": (CONS, "પ"), "V": (CONS, "ફ"), "ƒ": (CONS, "બ"), "¼": (CONS, "ભ"), "{": (CONS, "મ"),
    "Þ": (CONS, "ય"), "h": (CONS, "ર"), "÷": (CONS, "લ"), "ð": (CONS, "વ"),
    "þ": (CONS, "શ"), "‚": (CONS, "સ"), "n": (CONS, "હ"), "¤": (CONS, "ળ"),
    "¢": (CONS, "ક્ર"), "«": (CONS, "પ્ર"), "©": (CONS, "શ્ર"), "§": (CONS, "શ્ન"),
    "ÿ": (CONS, "દ્ર"), "ü": (CONS, "ષ્ટ"), "c": (CONS, "ષ્ઠ"), "ï": (CONS, "શ્વ"),
    "ù": (CONS, "શ્ચ"), "ä": (CONS, "જ્જ"), "Ø": (CONS, "દ્ધ"), "Æ": (CONS, "દ્દ"),
    "j": (CONS, "દ્ઘ"), "ã": (CONS, "દ્ય"), "î": (CONS, "દ્વ"), "£": (CONS, "ફ્ર"),
    "J": (CONS, "ત્ન"), "ö": (CONS, "હ્ન"), "ñ": (CONS, "હ્મ"),
    "ó": (CONS, "પ્ત"), "¬": (CONS, "ક્ક"), "ë": (CONS, "ઢ્ઢ"),
    # ligatures that carry their own vowel sign: (consonant, sign)
    "ò": (CONS, ("જ", "ા")), "S": (CONS, ("જ", "ી")), "Á": (CONS, ("ર", "ુ")), "Y": (CONS, ("ર", "ૂ")),
    "Ó": (CONS, ("હ", "ૃ")), "á": (CONS, ("દ", "ૃ")),
    # half forms (with virama); half + k = the full consonant
    "õ": (HALF, "ક્"), "ø": (HALF, "ગ્"), "å": (HALF, "ચ્"), "ß": (HALF, "જ્"), "Û": (HALF, "ણ્"),
    "í": (HALF, "ત્"), "Ú": (HALF, "થ્"), "æ": (HALF, "ધ્"), "L": (HALF, "ન્"), "Ã": (HALF, "પ્"),
    "^": (HALF, "ફ્"), "ç": (HALF, "બ્"), "B": (HALF, "મ્"), "Õ": (HALF, "લ્"), "é": (HALF, "ળ્"),
    "~": (HALF, "શ્"), "»": (HALF, "ષ્"), "M": (HALF, "સ્"), "û": (HALF, "ક્ષ્"),
    "Ì": (HALF, "હ્ય્"), "Ï": (HALF, "ખ્"), "Ô": (HALF, "વ્"), "Ç": (HALF, "ભ્"),
    "¥": (HALF, "ત્ત્"), "º": (HALF, "ત્ર્"), "¿": (HALF, "જ્ઞ્"),
    # the stem: ા, or completes a half form
    "k": (STEM, "ા"),
    # modifiers that stay inside the consonant cluster
    "Ù": (MOD, "્ર"), "ú": (MOD, "્ર"), "T": (MOD, "્"), "â": (YA, "્ય"),
    # vowel signs
    "e": (SIGN, "ી"), "w": (SIGN, "ુ"), "q": (SIGN, "ૂ"), "u": (SIGN, "ે"), "i": (SIGN, "ૈ"),
    "ì": (SIGN, "ૉ"), "]": (SIGN, "ૃ"),
    "ª": (SIGN, "ીં"), "U": (SIGN, "ેં"),
    # nasal marks (always last in the syllable)
    "t": (NAS, "ં"), "P": (NAS, "ઁ"),
    # reph and anusvara as one glyph (કર્યું, ઉમેર્યું)
    "O": (REPH, "ર્ં"),
    # independent vowels
    "y": (VOWEL, "અ"), "R": (VOWEL, "ઇ"), "E": (VOWEL, "ઈ"), "W": (VOWEL, "ઉ"), "Q": (VOWEL, "ઊ"),
    "É": (VOWEL, "ઋ"), "ô": (VOWEL, "ઉં"), "Ÿ": (VOWEL, "ઊં"),
    # reph (ર્ over the preceding syllable)
    "o": (REPH, "ર્"),
    # pre-base i: (sign, nasal, reph)
    "r": (PRE, ("િ", "", False)), "Â": (PRE, ("િ", "", False)), "®": (PRE, ("િ", "ં", False)),
    "Š": (PRE, ("િ", "", True)), "‹": (PRE, ("િ", "ં", True)),
}
DIGITS = {str(i): "૦૧૨૩૪૫૬૭૮૯"[i] for i in range(10)}
OTHERS = {'"': "×", "'": "‘", "‘": "‘", "’": "’", "“": "“", "”": "”", "•": "•"}

VOWEL_COMPOSE = {
    ("અ", "ા"): "આ", ("અ", "ે"): "એ", ("અ", "ૈ"): "ઐ", ("અ", "ૉ"): "ઑ",
    ("આ", "ે"): "ઓ", ("અ", "ો"): "ઓ", ("અ", "ૌ"): "ઔ", ("અ", "ોં"): "ઓં", ("આ", "ૈ"): "ઔ", ("આ", "ૉ"): "ઑ", ("અ", "ેં"): "એં", ("આ", "ેં"): "ઓં",
}
SIGN_COMPOSE = {("ા", "ે"): "ો", ("ા", "ૈ"): "ૌ", ("ા", "ેં"): "ોં", ("ા", "ૉ"): "ૉ"}


class Syl:
    __slots__ = ("cluster", "open", "vowel", "signs", "nas", "reph")

    def __init__(self, cluster="", open_=False, vowel=False):
        self.cluster, self.open, self.vowel = cluster, open_, vowel
        self.signs, self.nas, self.reph = [], "", False

    def text(self):
        signs = []
        for s in self.signs:
            if signs and (signs[-1], s) in SIGN_COMPOSE:
                signs[-1] = SIGN_COMPOSE[(signs[-1], s)]
            else:
                signs.append(s)
        if self.vowel:
            v = self.cluster
            while signs and (v, signs[0]) in VOWEL_COMPOSE:
                v = VOWEL_COMPOSE[(v, signs.pop(0))]
            return v + "".join(signs) + self.nas
        return ("ર્" if self.reph else "") + self.cluster + "".join(signs) + self.nas


def decode(legacy):
    """Legacy byte-glyph string -> Unicode Gujarati. Also returns a list of
    codes it had no mapping for (never silently dropped: they're kept as-is
    in the output and reported)."""
    out, unknown = [], []
    cur = None
    pending = None  # (sign, nasal, reph) from a pre-base i, for the next cluster

    def flush():
        nonlocal cur
        if cur is not None:
            out.append(cur.text())
            cur = None

    def start(cluster, open_=False, vowel=False):
        nonlocal cur, pending
        flush()
        cur = Syl(cluster, open_, vowel)
        if pending and not vowel:
            sign, nas, reph = pending
            cur.signs.append(sign)
            cur.nas = nas or cur.nas
            cur.reph = cur.reph or reph
            pending = None

    for ch in legacy:
        if ch == "<":  # one glyph for "ંક": nasal on this syllable, then ક (બેંક)
            if cur is not None:
                cur.nas = "ં"
            start("ક")
            continue
        kind, val = T.get(ch, (OTHER, None))
        if kind == HALF:
            if cur is not None and cur.open:
                cur.cluster += val
            else:
                start(val, open_=True)
        elif kind == CONS:
            cons, sign = val if isinstance(val, tuple) else (val, None)
            if cur is not None and cur.open:
                cur.cluster += cons
                cur.open = False
            else:
                start(cons)
            if sign:
                cur.signs.append(sign)
        elif kind == YA:
            if cur is not None and cur.open:
                cur.cluster += "ય"
                cur.open = False
            elif cur is not None and not cur.vowel:
                cur.cluster += val
            else:
                start("ય")
        elif kind == STEM:
            if cur is not None and cur.open and cur.cluster.endswith("્"):
                cur.cluster = cur.cluster[:-1]
                cur.open = False
            elif cur is not None:
                cur.signs.insert(0, "ા") if cur.vowel and not cur.signs else cur.signs.append("ા")
            else:
                out.append("ા")
        elif kind == MOD:
            if cur is None:
                out.append(val)
            else:
                cur.cluster += val
                cur.open = val == "્"
        elif kind == SIGN:
            if cur is None:
                out.append(val)
            else:
                cur.signs.append(val)
        elif kind == NAS:
            if cur is None:
                out.append(val)
            else:
                cur.nas = val
        elif kind == VOWEL:
            start(val, vowel=True)
        elif kind == REPH:
            if cur is not None and not cur.vowel:
                cur.reph = True
                if val.endswith("ં"):
                    cur.nas = "ં"
            else:
                out.append(val)
        elif kind == PRE:
            flush()
            pending = val
        else:
            flush()
            if pending:  # a pre-base sign with nothing after it
                out.append(pending[0])
                pending = None
            if ch in DIGITS:
                out.append(DIGITS[ch])
            elif ch in OTHERS:
                out.append(OTHERS[ch])
            elif ch.isascii() and not ch.isalpha():
                out.append(ch)
            else:
                out.append(ch)
                unknown.append(ch)
    flush()
    if pending:
        out.append(pending[0])
    return "".join(out), unknown


LEGACY_FONTS = ("BBharatiGopikaTwo", "BBharatiMaruti", "BBharatiTitleTwo")


def is_legacy(font_name):
    return any(f in font_name for f in LEGACY_FONTS)


def span_text(span):
    """Unicode text of one PDF span: decoded if it's in a legacy Bharati
    font, as-is otherwise (Helvetica/Arial/Calibri spans are real Latin)."""
    if is_legacy(span["font"]):
        text, _ = decode(span["text"])
        return text
    return span["text"]


def issues(text):
    """Structural problems in decoded text that betray a mapping error."""
    probs = []
    if re.search(r"(^|[\s(])[ા-ૌઁ-ઃ]", text):
        probs.append("sign-without-consonant")
    if re.search(r"્($|\s)", text):
        probs.append("dangling-virama")
    return probs


if __name__ == "__main__":
    tests = {
        "furÃkx÷ ¢ktrík": "કેપિટલ ક્રાંતિ",
        "«rŒrcŒ": "પ્રતિષ્ઠિત",
        "{kxu": "માટે",
        "fkÃkzeÞk": "કાપડીયા",
        "zî.": "ડૉ.",
        "Wj kx™": "ઉદ્ઘ ાટન",
    }
    for leg, want in tests.items():
        got, unk = decode(leg)
        print("OK " if got == want else "BAD", repr(leg), "->", got, "| want", want, unk or "")
