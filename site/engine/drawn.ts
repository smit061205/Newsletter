// A drawn cover for an Aavtikal article with no true picture of its subject (the user, 30 Oct: a designed cover, not a
// wrong photo; a new AI model has no free photo of itself). In Aavtikal's own look: its near-black ground, the beat's
// colour, the subject's name set large in Anek Latin's condensed extra-bold, and a drawing for the beat behind it (a net of
// points for AI, a circuit grid for Tech, orbits for Science). Only the name and a few plain words, never a number, so
// it can't say anything the article's check hasn't. Drawn once by the desk (next/og), stored like a photo, 1920 × 1080.
import { readFileSync } from "node:fs";
import { ImageResponse } from "next/og.js";

const W = 1920, H = 1080, PAD = 120;
const COLOUR: Record<string, string> = { ai: "#B58BD9", tech: "#2BB3E6", science: "#9CCB45", politics: "#93A6BA" };
const BEAT: Record<string, string> = { ai: "AI", tech: "TECH", science: "SCIENCE", politics: "POLITICS" };
const font = (f: string) => readFileSync(new URL(`./fonts/${f}`, import.meta.url));
const FONTS = [
  { name: "Anek", data: font("AnekLatin-CondensedExtraBold.ttf"), weight: 800 as const, style: "normal" as const },
  { name: "Anek", data: font("AnekLatin-SemiBold.ttf"), weight: 600 as const, style: "normal" as const },
];

/** A pseudo-random number from a seed (the same subject always gets the same drawing). */
function random(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507), h = Math.imul(h ^ (h >>> 13), 3266489909), (h ^= h >>> 16) >>> 0) / 4294967296);
}

/** The beat's drawing, as SVG over the right of the cover. */
function drawing(beat: string, c: string, seed: string): string {
  const r = random(seed);
  const parts: string[] = [];
  if (beat === "ai") {
    // a net of points, each joined to its near neighbours
    const pts = Array.from({ length: 70 }, () => [880 + r() * 1000, 40 + r() * 1000]);
    for (const [i, a] of pts.entries()) for (const b of pts.slice(i + 1)) {
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d < 190) parts.push(`<line x1="${a[0].toFixed(0)}" y1="${a[1].toFixed(0)}" x2="${b[0].toFixed(0)}" y2="${b[1].toFixed(0)}" stroke="${c}" stroke-opacity="${(0.5 - d / 500).toFixed(2)}" stroke-width="1.5"/>`);
    }
    for (const [x, y] of pts) parts.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(3 + r() * 6).toFixed(1)}" fill="${c}" fill-opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`);
  } else if (beat === "tech") {
    // a circuit: traces on a grid, turning once, ending in pads
    for (let k = 0; k < 34; k++) {
      const x = 960 + Math.floor(r() * 24) * 40, y = 60 + Math.floor(r() * 24) * 40;
      const dx = (Math.floor(r() * 8) + 2) * 40 * (r() < 0.5 ? -1 : 1), dy = (Math.floor(r() * 6) + 2) * 40 * (r() < 0.5 ? -1 : 1);
      parts.push(`<path d="M${x} ${y}h${dx}v${dy}" fill="none" stroke="${c}" stroke-opacity="0.45" stroke-width="3"/>`,
        `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${c}" stroke-opacity="0.7" stroke-width="3"/>`,
        `<rect x="${x + dx - 9}" y="${y + dy - 9}" width="18" height="18" fill="${c}" fill-opacity="0.6"/>`);
    }
  } else {
    // orbits round a body, each with its moon
    const cx = 1580, cy = 520;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="70" fill="${c}" fill-opacity="0.5"/>`);
    for (let k = 1; k <= 6; k++) {
      const rx = 120 + k * 95, ry = rx * (0.34 + r() * 0.12), tilt = -25 + r() * 50, a = r() * Math.PI * 2;
      parts.push(`<g transform="rotate(${tilt.toFixed(1)} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry.toFixed(0)}" fill="none" stroke="${c}" stroke-opacity="${(0.55 - k * 0.05).toFixed(2)}" stroke-width="2"/>`
        + `<circle cx="${(cx + rx * Math.cos(a)).toFixed(0)}" cy="${(cy + ry * Math.sin(a)).toFixed(0)}" r="${(8 + r() * 10).toFixed(0)}" fill="${c}" fill-opacity="0.8"/></g>`);
    }
  }
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`).toString("base64")}`;
}

type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown } };
const el = (type: string, style: Record<string, unknown>, children?: unknown, more: Record<string, unknown> = {}): Node => ({ type, props: { style, children, ...more } });

/** The cover: `name` the subject's name (English letters), `kind` a few plain words on what it is. A PNG. */
export async function drawCover(beat: string, name: string, kind: string): Promise<Buffer> {
  const c = COLOUR[beat] ?? COLOUR.ai;
  // the name as large as fits: one line when short, else two (the condensed face is about 0.43 of its size a letter)
  const n = name.length;
  const perLine = n <= 13 ? n : Math.ceil(n / 2) + 2;
  const size = Math.round(Math.min(n <= 13 ? 330 : 250, (W - 2 * PAD) / (0.43 * Math.max(4, perLine))));
  const tree = el("div", { width: W, height: H, display: "flex", position: "relative", background: "#0B0B0F", fontFamily: "Anek" }, [
    el("img", { position: "absolute", left: 0, top: 0, width: W, height: H }, undefined, { src: drawing(beat, c, name), width: W, height: H }),
    // a shade from the left, so the name reads over the drawing
    el("div", { position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", backgroundImage: "linear-gradient(90deg, #0B0B0F 0%, rgba(11,11,15,0.94) 45%, rgba(11,11,15,0) 82%)" }),
    el("div", { position: "absolute", left: 0, top: 0, width: W, height: 14, display: "flex", background: c }),
    el("div", { position: "absolute", left: PAD, top: 96, display: "flex", alignItems: "center", fontSize: 40, fontWeight: 600, letterSpacing: 6, color: "#E6E5EA" }, [
      el("span", {}, "AAVTIKAL"),
      el("span", { color: c, marginLeft: 22 }, `/ ${BEAT[beat] ?? "AI"}`),
    ]),
    el("div", { position: "absolute", left: PAD, right: PAD, bottom: 110, display: "flex", flexDirection: "column" }, [
      el("div", { display: "flex", fontSize: size, fontWeight: 800, lineHeight: 0.92, color: c, letterSpacing: -2, maxWidth: W - 2 * PAD }, name),
      ...(kind ? [el("div", { display: "flex", alignItems: "center", marginTop: 44, fontSize: 46, fontWeight: 600, color: "#E6E5EA" }, [
        el("div", { width: 64, height: 4, background: c, marginRight: 26, display: "flex" }),
        el("span", {}, kind),
      ])] : []),
    ]),
  ]);
  const res = new ImageResponse(tree as unknown as React.ReactElement, { width: W, height: H, fonts: FONTS });
  return Buffer.from(await res.arrayBuffer());
}
