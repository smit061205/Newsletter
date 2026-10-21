"""Writes publications/dev-test/profile.json from Capital Kranti's profile, with
the licensed Gopika fonts swapped for free Unicode Gujarati fonts already in
web/public/fonts -- so the whole engine (layout, gates, printing) runs where
the licensed fonts can't be: CI, cloud sessions, a fresh checkout.

Hind Vadodara sets visibly larger than Gopika at the same point size, so
every size is scaled by SCALE (pitches, spacing and the grid stay as they are).
Re-run after changing the real profile:

    python3 scripts/dev_profile.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCALE = 0.8

FONTS = {
    "gopika-regular": "/fonts/HindVadodara-Regular.ttf",
    "gopika-bold": "/fonts/HindVadodara-Bold.ttf",
    "gopika-light": "/fonts/HindVadodara-Regular.ttf",
    "gopika-bolditalic": "/fonts/HindVadodara-Bold.ttf",
}


def scaled(v):
    return round(v * SCALE, 2)


def main():
    p = json.loads((ROOT / "publications/capital-kranti/profile.json").read_text("utf8"))
    p["id"] = "dev-test"
    p["name"] = "Capital Kranti layout test (free fonts)"
    for fid, url in FONTS.items():
        f = p["fonts"][fid]
        f["file"] = url
        f["encoding"] = "unicode"
        f["restricted"] = False
        f.pop("latin", None)
    t = p["type"]
    t["body"]["size"] = scaled(t["body"]["size"])
    t["body"]["sizes"] = [scaled(s) for s in t["body"]["sizes"]]
    h = t["headline"]
    for k in ("capByColumns", "bands"):
        if k in h:
            h[k] = [[scaled(x) for x in v] if isinstance(v, list) else scaled(v) for v in h[k]]
    h["min"] = scaled(h["min"])
    for role in ("kicker", "deck"):
        t[role]["min"] = scaled(t[role]["min"])
    t["caption"]["size"] = scaled(t["caption"]["size"])
    p["chrome"] = "../capital-kranti/chrome.json"
    p["fontLicence"] = "Free fonts (SIL OFL) -- for testing the engine only."
    out = ROOT / "publications/dev-test/profile.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(p, ensure_ascii=False, indent=2) + "\n", "utf8")
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
