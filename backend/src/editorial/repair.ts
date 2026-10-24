// The day's paper mending what its checks found, before anyone sees it
// (pipeline.ts, after the layout): a story with a number its source doesn't
// have is written once more, told which numbers to leave out -- the source
// said "equal shares" and the translation printed "૫૦:૫૦" (24 Oct). One that
// still has them keeps its flag for the editor; the layout's own failures
// are mended by laying the paper out again (build.ts seedShift).
import type { Store, Story } from "../store.ts";
import { DEFAULT_MODEL, env, numbersNotIn, rewriteOne } from "./rewrite.ts";
import { translateOne } from "./translate.ts";

/** Writes the day's number-flagged stories again. Returns how many came out clean. */
export async function repairFacts(store: Store, date: string, log: (s: string) => void): Promise<number> {
  const key = env("OPENROUTER_API_KEY");
  if (!key) return 0;
  // (a round-up of several releases is written from all of them: left to the editor)
  const flagged = store.stories(date).filter((s) => s.factCheck && s.releaseId && (s.mergedFrom?.length ?? 1) <= 1);
  let mended = 0;
  await Promise.all(flagged.map(async (s) => {
    const r = store.release(s.releaseId!);
    if (!r) return;
    const nums = s.factCheck!.replace(/^[^:]*:\s*/, "");
    const note = `\nIMPORTANT: a first version of this story put in numbers that are not in the release (${nums}). ` +
      "Use only numbers that appear in the release; where it says something like \"equal shares\" or \"half\", say it in words as it does.";
    try {
      const got = s.translatedFrom ? await translateOne(r, key, undefined, note)
        : await rewriteOne(r, s.model && s.model !== "as-is" ? s.model : env("OPENROUTER_MODEL") ?? DEFAULT_MODEL, key, 1, note);
      const left = numbersNotIn(`${got.story.headline} ${got.story.deck} ${got.story.bodies.long}`, `${r.headline} ${r.subhead} ${r.body}`, r.date);
      if (left.length) { log(`  ${s.id}: written again, still with ${left.join(", ")}: left for the editor`); return; }
      // the new wording, the story's place in the paper kept
      const fixed: Story = { ...s, kicker: got.story.kicker, headline: got.story.headline, deck: got.story.deck, bodies: got.story.bodies,
                             caption: got.story.caption || s.caption, factCheck: undefined };
      store.putStory(fixed);
      mended++;
      log(`  ${s.id}: written again without the numbers its source doesn't have (${nums})`);
    } catch (e) {
      log(`  ${s.id}: couldn't be written again (${e instanceof Error ? e.message : e})`);
    }
  }));
  return mended;
}
