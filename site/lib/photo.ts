// Pictures at the size the reader needs (the user, 30 Oct: the site was slow; a 1920-wide file went to every small card).
// Wikimedia makes its copies at fixed widths (500, 960 and 1920 work; 640 and 800 are refused), and the site's own photos
// are made smaller by app/media, once each, then kept by the CDN. Anything else stays as it is.
const STEPS = [500, 960, 1920] as const;

/** A picture's address at a width, or null when no smaller copy can be asked for. */
function at(url: string, w: number): string | null {
  const plain = url.replace(/\?.*$/, "");
  if (/^\/media\/.*\.(jpe?g|png)$/.test(plain)) return `${plain}?w=${w}`;
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(plain) || !/\.(jpe?g|png)$/i.test(plain.replace(/\/\d+px-[^/]+$/, ""))) return null;
  if (/\/thumb\//.test(plain)) return plain.replace(/\/\d+px-/, `/${w}px-`);
  const file = plain.split("/").pop();
  return plain.replace("/wikipedia/commons/", "/wikipedia/commons/thumb/") + `/${w}px-${file}`;
}

/** What an <img> needs to take the smallest copy that looks sharp: `sizes` says how wide it shows. */
export function pic(p: { url: string; width: number }, sizes: string): { src: string; srcSet?: string; sizes?: string } {
  const copies: { w: number; url: string }[] = [];
  for (const w of STEPS) {
    const url = w < p.width ? at(p.url, w) : null;
    if (url) copies.push({ w, url });
  }
  if (!copies.length) return { src: p.url };
  return { src: copies[Math.min(1, copies.length - 1)].url, srcSet: [...copies.map((c) => `${c.url} ${c.w}w`), `${p.url} ${p.width}w`].join(", "), sizes };
}

/** How wide the pictures show. Phones get a little less than their full width: 960 looks sharp there and is a third the size. */
export const SIZES = {
  thumb: "160px",
  card: "(max-width: 800px) 60vw, 33vw",
  lead: "(max-width: 800px) 70vw, 66vw",
  full: "(max-width: 800px) 70vw, 100vw",
  inside: "(max-width: 800px) 70vw, 760px",
};
