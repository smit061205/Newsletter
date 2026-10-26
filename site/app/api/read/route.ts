// One opening of a story, sent by the story page once per browser (for "most
// read"). Only a count per story per day is kept; nothing about the reader.
import { countRead } from "@/lib/db.ts";

export async function POST(req: Request) {
  const id = (await req.text()).trim();
  if (/^[\w-]{1,80}$/.test(id)) await countRead(id).catch(() => {});
  return new Response(null, { status: 204 });
}
