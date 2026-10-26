// The fillers the layout engine (layout/engine.ts, layout/fill.ts) sets in a
// block no story takes: the paper's house ad, or one of its messages, each
// set to fill its box exactly. (The old gap closer that lived here, growing
// packed stories with the AI, was taken out with the old packer, 26 Oct 2026.)
import type { Element, TextElement } from "@ck/shared/contract";
import { setDisplay } from "./display.ts";
import { profile } from "../profile.ts";
import { stackLines } from "./compose.ts";
import type { Measurer } from "./measure.ts";
import { spanWidth } from "./module.ts";
import { BODY, DECK, GRID, HEADLINE, INK, PT } from "./typography.ts";

/** The paper's house ad, set to fill a box: a ruled panel, lines centred. */
export async function houseAd(id: string, x: number, y: number, w: number, h: number, m: Measurer): Promise<Element[] | null> {
  const lines = profile.fillers.houseAd;
  if (!lines.length || h < 60 * PT || w < GRID.column) return null;
  const fontOf = (r: string) => (r === "headline" ? HEADLINE.font : r === "deck" ? DECK.font : BODY.font);
  const pad = 6 * PT;
  const inner = w - 2 * pad;
  // the largest size at which every line fits the width and all fit the height
  for (let top = Math.min(48 * PT, h / 3); top >= 10 * PT; top -= PT) {
    const sets: { lines: Awaited<ReturnType<Measurer["breakLines"]>>[0]; size: number; font: string }[] = [];
    let ok = true;
    for (const l of lines) {
      const size = Math.max(8 * PT, top * l.scale);
      const [ls] = await m.breakLines([{ paras: [l.text], width: inner, font: fontOf(l.role), size, safety: 0.97 }]);
      if (ls.length > 1 || ls[0].width > inner) { ok = false; break; }
      sets.push({ lines: ls, size, font: fontOf(l.role) });
    }
    if (!ok) continue;
    const pitchOf = (s: { size: number }) => s.size * 1.35;
    const total = sets.reduce((a, s) => a + pitchOf(s), 0);
    if (total > h - 2 * pad) continue;
    const out: Element[] = [{ id: `${id}-box`, kind: "rect", articleId: id, x, y, width: w, height: h, stroke: INK, strokeWidth: 1.2 * PT }];
    let cy = y + (h - total) / 2;
    for (const [i, s] of sets.entries()) {
      const st = await stackLines(m, s.lines, `${id}-l${i}`, id, x + pad, cy, inner, s.font, s.size, pitchOf(s));
      out.push(...st.elements.map((e) => ({ ...e, align: "center" as const, articleId: id } as TextElement)));
      cy += pitchOf(s);
    }
    return out;
  }
  return null;
}

/** A public-service message (profile fillers.messages) in a ruled panel, the
 * way the paper prints "રક્તદાન મહાદાન ચક્ષુદાન શ્રેષ્ઠદાન" -- always one size
 * (profile fillers.messageCols wide, messageHeight tall), never grown to a
 * hole's size (24 Oct: one took a third of the front page): only a hole as
 * wide as the panel and at least as deep takes it, and what's under it is
 * filled by the caller. One in the paper (maxMessages), claimed before any
 * wait, so pages laid out side by side can't both take one. The `n`th
 * message first. Returns the elements and the height used. */
export async function messageFiller(id: string, x: number, y: number, w: number, h: number, n: number, m: Measurer, fillers: FillerCount):
  Promise<{ elements: Element[]; height: number; text: string } | null> {
  const { messages: all, messageCols, messageHeight, maxMessages } = profile.fillers;
  const boxW = spanWidth(messageCols);
  const boxH = messageHeight * PT;
  if (!all.length || Math.abs(w - boxW) > 1 || h < boxH - 0.5 || fillers.messages.size >= maxMessages) return null;
  const claim = `\u0000${id}`;
  fillers.messages.add(claim);
  try {
    const fresh = all.filter((t) => !fillers.messages.has(t));
    const messages = fresh.length ? fresh : all;
    const pad = 8 * PT;
    const inner = boxW - 2 * pad;
    let best: { text: string; size: number; lines: number; height: number } | null = null;
    for (let k = 0; k < messages.length; k++) {
      const text = messages[(n + k) % messages.length];
      for (let lines = 1; lines <= 5; lines++) {
        const got = await setDisplay(m, text, { font: HEADLINE.font, max: Math.min(40 * PT, boxH * 0.3), min: 12 * PT, maxLines: lines,
                                               leading: 1.2, align: "fit" }, `${id}-t`, id, 0, 0, inner);
        if (!got || got.lines !== lines || got.bottom > boxH - 2 * pad) continue;
        // the message and setting that fill the panel best; among equals, the larger type
        if (!best || got.bottom > best.height + 0.5 || (Math.abs(got.bottom - best.height) <= 0.5 && got.size > best.size)) {
          best = { text, size: got.size, lines, height: got.bottom };
        }
      }
      if (best) break; // the day's message, not the one that happens to fill best
    }
    if (!best) return null;
    const set = await setDisplay(m, best.text, { font: HEADLINE.font, max: best.size, min: best.size, maxLines: best.lines,
                                                leading: 1.2, align: "fit" }, `${id}-t`, id, x + pad, y + (boxH - best.height) / 2, inner);
    if (!set) return null;
    fillers.messages.add(best.text);
    return {
      elements: [{ id: `${id}-box`, kind: "rect", articleId: id, x, y, width: boxW, height: boxH, stroke: INK, strokeWidth: 1.5 * PT }, ...set.elements],
      height: boxH, text: best.text,
    };
  } finally {
    fillers.messages.delete(claim);
  }
}

/** Fillers used so far in the issue (shared by its pages): profile
 * fillers.maxMessages / maxHouseAds cap them for the whole issue. */
export interface FillerCount { messages: Set<string>; houseAds: number }

