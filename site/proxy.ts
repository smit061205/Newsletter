// The reader's language on a first visit, from where they are (the user, 29 Oct): Gujarat reads Gujarati, the rest of
// India Hindi, the rest of the world English, on the same page in that language. A language the reader picks is kept
// (lib/langchoice.ts) and wins after that; a returning reader's home page opens in it. Search engines and link
// previews are never moved, so every language stays findable. It runs only on a first visit or a home page in
// another language than the one kept, so other pages open as fast as before.
import { NextResponse, type NextRequest } from "next/server";

type Lang = "gu" | "en" | "hi";
const COOKIE = "ck_lang";
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|twitter|linkedin|embedly|lighthouse|headless/i;

const langOf = (path: string): Lang => (/^\/en(\/|$)/.test(path) ? "en" : /^\/hi(\/|$)/.test(path) ? "hi" : "gu");
const inLang = (lang: Lang, base: string) => (lang === "gu" ? base : base === "/" ? `/${lang}` : `/${lang}${base}`);

/** Vercel's reading of where the request came from (ISO 3166: IN, and Gujarat is IN-GJ) */
function fromPlace(req: NextRequest): Lang | null {
  const country = req.headers.get("x-vercel-ip-country");
  if (!country) return null;
  if (country !== "IN") return "en";
  return req.headers.get("x-vercel-ip-country-region") === "GJ" ? "gu" : "hi";
}

export function proxy(req: NextRequest) {
  // pages opened in the browser only: not the app's own page loads, not search engines or previews, not a page
  // fetched ahead of a change of language (components/LangLink.tsx: the choice is kept only on the click)
  if (req.method !== "GET" || req.headers.get("sec-purpose")?.includes("prefetch") || req.headers.has("rsc") || req.headers.has("next-router-state-tree") || req.nextUrl.searchParams.has("_rsc") || !(req.headers.get("accept") ?? "").includes("text/html")
      || BOTS.test(req.headers.get("user-agent") ?? "")) return NextResponse.next();
  const path = req.nextUrl.pathname;
  const here = langOf(path);
  const kept = req.cookies.get(COOKIE)?.value;
  const saved = kept === "gu" || kept === "en" || kept === "hi" ? kept : null;
  const want = saved ?? fromPlace(req);
  if (!want) return NextResponse.next();
  const base = here === "gu" ? path : path.slice(3) || "/";
  // the place moves any page on a first visit; a kept choice moves only the home page
  const move = want !== here && (!saved || base === "/");
  const res = move ? NextResponse.redirect(new URL(inLang(want, base) + req.nextUrl.search, req.url), 307) : NextResponse.next();
  if (!saved) res.cookies.set(COOKIE, want, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  return res;
}

export const config = {
  matcher: [
    // a first visit: no language kept yet (not the editor, the site's own files or its API)
    { source: "/((?!api|_next|media|editor|.*\\..*).*)", missing: [{ type: "cookie", key: "ck_lang" }] },
    // a home page in another language than the one kept
    { source: "/", has: [{ type: "cookie", key: "ck_lang", value: "en|hi" }] },
    { source: "/en", has: [{ type: "cookie", key: "ck_lang", value: "gu|hi" }] },
    { source: "/hi", has: [{ type: "cookie", key: "ck_lang", value: "gu|en" }] },
  ],
};
