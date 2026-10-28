// Every way a story can be set on the page: for each width it may take, each
// length on its ladder (editorial/ladder.ts) and each way of showing its
// photo, the module (module.ts) and its exact height -- what the page solver
// (layout/guillotine.ts) chooses from. Settings that break the desk's rules
// are left out, so the solver can't choose them:
//   - a headline, kicker or deck line that doesn't fill its width (S2);
//   - a headline over 30% of its story (gate 3);
//   - a body set loosely (S9);
//   - a wide photo layout the photo rules don't allow.
// Each setting also says how much taller it can be made without a new text:
// a little more space under the headline and the sub-heading (2.5pt each, as
// the gap closer did), and the body's line pitch up to 2% looser.
import { atRung, type Rung } from "../editorial/ladder.ts";
import { wordForWord, type Story } from "../store.ts";
import type { Measurer } from "./measure.ts";
import { buildModule, type Module, type PhotoMode } from "./module.ts";
import { headlineHeavy, spansFor } from "./pack.ts";
import { STORY_P90_EM, storyLooseness } from "./style.ts";
import { BODY, GRID, HEADLINE, MAX_STORY_COLS, PT } from "./typography.ts";

export interface Option {
  module: Module;
  /** the rung it's set at (index into the story's ladder, 0 = longest) */
  rung: number;
  height: number;
  /** how much taller it can be made (px): header spacing, then a looser pitch */
  stretch: number;
  /** how much the desk dislikes it: copy cut, photo lost, loose lines */
  cost: number;
}

/** Most extra space under the headline, and under the sub-heading (fit.ts SPREAD). */
export const HEAD_SPREAD = 2.5 * PT;
/** Most a body's pitch may open up. */
export const PITCH_STRETCH = 0.02;

/** Lines in a module's tallest column (its body lines over its columns, rounded up). */
export const columnLines = (mod: Module) => Math.ceil(mod.bodyLines / Math.max(1, mod.cols));

/** How much taller a module can be made without new text. */
export function stretchOf(mod: Module): number {
  const hasDeck = mod.deckSize > 0;
  return (hasDeck ? 2 * HEAD_SPREAD : HEAD_SPREAD) + columnLines(mod) * mod.pitch * PITCH_STRETCH;
}

/** How much a story's copy matters, by rank: losing a lead's copy costs most. */
const WEIGHT = [3, 2, 1.5, 1, 0.7];

export class Blocks {
  private tables = new Map<string, Promise<Option[]>>();
  private m: Measurer;
  private ladders: Map<string, Rung[]>;
  constructor(m: Measurer, ladders: Map<string, Rung[]>) {
    this.m = m;
    this.ladders = ladders;
  }

  /** A story's settings measured again (its ladder changed). */
  forget(id: string) {
    for (const k of [...this.tables.keys()]) if (k.startsWith(`${id}|`)) this.tables.delete(k);
  }

  rungs(story: Story): Rung[] {
    return this.ladders.get(story.id) ?? [{ body: story.bodies.long, words: story.bodies.long.split(/\s+/).length, from: "long" }];
  }

  /** The widths a story of this rank may take on a page: a brief one to
   * three columns, a story two or more (a lead three or more; a lesser one one), up to the
   * widest a story may be. Its usual widths (pack.ts spansFor) cost least. */
  widths(story: Story, rank: number): number[] {
    const most = story.fullWidth ? GRID.columns : MAX_STORY_COLS;
    // (a less important story may run down one column too, beside a narrow ad: at a cost)
    const [from, to] = rank >= 5 ? [1, 3] : rank === 1 ? [3, most] : rank === 2 ? [2, most] : [1, most];
    return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i).filter((k) => k <= most);
  }

  /** The rank a story is set at: its own, else lower until some width has a
   * setting (a short story at the top of a page can't carry a lead's
   * headline over 30% of it: 26 Oct's page 3 had no design at all). */
  async settable(story: Story, rank: number): Promise<number> {
    for (let r = rank; r < 5; r++) {
      for (const cols of this.widths(story, r)) if ((await this.options(story, r, cols)).length) return r;
    }
    return 5;
  }

  /** Every acceptable setting of `story` at `cols` columns, shortest first. */
  options(story: Story, rank: number, cols: number): Promise<Option[]> {
    const key = `${story.id}|${rank}|${cols}`;
    if (!this.tables.has(key)) this.tables.set(key, this.build(story, rank, cols));
    return this.tables.get(key)!;
  }

  private async build(story: Story, rank: number, cols: number): Promise<Option[]> {
    const rungs = this.rungs(story);
    const top = rungs[0].words;
    const modes: PhotoMode[] = !story.photo ? [0] : (story.photos?.length ?? 0) >= 2 && cols >= 4 ? [0, 1, 2] : cols >= 2 ? [0, 1] : [0];
    const out: Option[] = [];
    // the rank's headline, else a step or two smaller: a short story at the
    // top of its page can't carry a lead's headline (over 30% of it)
    const sizes = [1, 0.85, 0.72];
    const full = HEADLINE.sizeFor(rank, cols);
    for (const [i, r] of rungs.entries()) {
      for (const mode of modes) {
        for (const [k, f] of sizes.entries()) {
          // (never a step below the paper's smallest headline: 28 Oct)
          if (k > 0 && full * sizes[k - 1] <= HEADLINE.min) break;
          const head = f === 1 ? undefined : { max: Math.max(HEADLINE.min, full * f), min: Math.max(HEADLINE.min, full * f * 0.72) };
          const mod = await buildModule(atRung(story, r), rank, cols, "long", this.m, mode, BODY.pitch, head);
          if (!Number.isFinite(mod.height)) break; // a photo layout the rules don't allow
          if (mod.displayFill < 0.97 && !(rank === 5 && cols === 1)) continue;
          if (headlineHeavy(mod)) continue;
          // a brief's headline too: at most four lines, under half the brief
          // (22 Oct: a one-column brief under a nine-line headline)
          const headLines = mod.elements.filter((e) => new RegExp(`^${story.id}-h\\d+$`).test(e.id)).length;
          if (rank >= 5 && (headLines > 4 || mod.headlineHeight > 0.45 * mod.height)) continue;
          const loose = storyLooseness(mod.elements);
          if (loose > STORY_P90_EM) break;
          // a wide photo that comes out like the usual one adds nothing
          if (mode && out.some((o) => o.rung === i && Math.abs(o.height - mod.height) < PT)) break;
          const cost = WEIGHT[Math.min(rank, 5) - 1] * (top - r.words) / Math.max(1, top)
            + (mod.photoDropped ? 1 + WEIGHT[Math.min(rank, 5) - 1] : 0) + (mode ? 0.1 : 0) + (r.from === "longer" ? 0.15 : 0) + loose * 2
            + (spansFor(rank).includes(cols) ? 0 : cols === 1 ? 1 : 0.3) + k * 0.4;
          out.push({ module: mod, rung: i, height: mod.height, stretch: stretchOf(mod), cost });
          break;
        }
      }
    }
    // a customer's article always shows its photo: a width where it can't is no option for it
    return (wordForWord(story) && story.photo ? out.filter((o) => !o.module.photoDropped) : out).sort((a, b) => a.height - b.height);
  }

  /** The heights a story can take at its widths (px), for planning a page: [shortest, longest]. */
  async range(story: Story, rank: number): Promise<{ cols: number; min: number; max: number }[]> {
    const out: { cols: number; min: number; max: number }[] = [];
    for (const cols of this.widths(story, rank)) {
      const opts = await this.options(story, rank, cols);
      if (opts.length) out.push({ cols, min: opts[0].height, max: opts[opts.length - 1].height + opts[opts.length - 1].stretch });
    }
    return out;
  }
}

/** A module's body set at a looser pitch, rebuilt (the same text and photo). */
export async function atPitch(mod: Module, pitch: number, m: Measurer): Promise<Module> {
  return buildModule(mod.story, mod.rank, mod.cols, mod.variant, m, mod.photoMode, Math.min(pitch, BODY.pitch * (1 + PITCH_STRETCH)), mod.head);
}
