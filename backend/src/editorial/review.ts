// A second pair of eyes on the finished pages: a vision model (Gemini Flash
// through OpenRouter) looks at each page image and lists what a page editor
// would fix, from a fixed list of issues tied to a story. It never moves
// anything itself -- its findings go into the build report (gate 5) for the
// editor, and the confident ones are what a rebuild should address.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { profile } from "../profile.ts";
import { env, openRouter } from "./rewrite.ts";

export const ISSUES = ["headline-too-big", "headline-too-small", "gap", "cramped", "photo-too-small", "photo-too-big",
                       "imbalanced", "duplicate-topic", "unreadable"] as const;

export interface Finding { page: number; issue: (typeof ISSUES)[number]; where: string; confidence: number; note: string }

const SCHEMA = {
  name: "page_review", strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["findings"],
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["issue", "where", "confidence", "note"],
          properties: {
            issue: { type: "string", enum: [...ISSUES] },
            where: { type: "string", description: "Which story: quote the first few words of its headline" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            note: { type: "string", description: "One short sentence, in English" },
          },
        },
      },
    },
  },
};

const PROMPT = `You are the chief sub-editor of a printed daily newspaper ("${profile.name}").
Look at this page as it will be printed. List only real layout problems a reader would notice:
a headline far too big or too small for its story, empty space, text crammed together, a photo too small to read or so big it swamps its story,
a lopsided page, two stories on the same topic, or anything unreadable. Do not comment on the news itself.
If the page is fine, return an empty list. Be strict about confidence: 0.8+ only when you are sure.`;

/** Review each page image (PNG files, page order). Returns findings and cost. */
export async function reviewPages(pngFiles: string[], opts: { log?: (s: string) => void } = {}): Promise<{ findings: Finding[]; cost: number; unreviewed: number[] } | null> {
  const key = env("OPENROUTER_API_KEY");
  if (!key) return null;
  const model = env("OPENROUTER_VISION_MODEL") ?? profile.editorial.leadModel;
  const findings: Finding[] = [];
  const unreviewed: number[] = []; // pages it never saw: the gate can't pass on them
  let cost = 0;
  // every page at once (one after another took two of the layout's three minutes, 24 Oct)
  const one = async (file: string, i: number) => {
    const b64 = (await readFile(file)).toString("base64");
    const res = await openRouter({
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
      body: JSON.stringify({
        model, temperature: 0, usage: { include: true },
        response_format: { type: "json_schema", json_schema: SCHEMA },
        messages: [{ role: "user", content: [
          { type: "text", text: `${PROMPT}\nThis is page ${i + 1}.` },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ] }],
      }),
    });
    if (!res.ok) {
      opts.log?.(`  review of page ${i + 1} failed (OpenRouter ${res.status}: ${(await res.text()).slice(0, 160)})`);
      unreviewed.push(i + 1);
      return;
    }
    const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
    cost += data.usage?.cost ?? 0;
    try {
      const out = JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
      for (const f of out.findings ?? []) if (ISSUES.includes(f.issue)) findings.push({ page: i + 1, ...f });
    } catch {
      opts.log?.(`  review of page ${path.basename(file)}: unreadable answer`);
      unreviewed.push(i + 1);
    }
  };
  await Promise.all(pngFiles.map(one));
  // (in page order, as one after another gave them)
  findings.sort((a, b) => a.page - b.page);
  unreviewed.sort((a, b) => a - b);
  return { findings, cost, unreviewed };
}
