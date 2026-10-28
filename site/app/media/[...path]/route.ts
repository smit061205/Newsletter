// The photo store is private (as it was made in Vercel), so the site serves its
// files itself, at its own address. Each file's name carries its content's
// fingerprint, so a file never changes: the CDN keeps it for a year and the
// store is read only on the first view of each file.
import { get } from "@vercel/blob";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const name = (await params).path.join("/");
  // the daily paper's photos and e-paper by day; Aavtikal's photos (pipeline/features.ts) in their own folder
  const m = name.match(/^(?:(?:photos|epaper)\/\d{4}-\d{2}-\d{2}|aavtikal)\/[a-z0-9-]+\.(jpg|jpeg|png|pdf)$/);
  if (!m) return new Response("not found", { status: 404 });
  const got = await get(name, { access: "private" }).catch(() => null);
  if (!got) return new Response("not found", { status: 404 });
  return new Response(got.stream, {
    headers: {
      "content-type": TYPES[m[1]],
      "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
      ...(m[1] === "pdf" ? { "content-disposition": `inline; filename="${name.split("/").pop()}"` } : {}),
    },
  });
}
