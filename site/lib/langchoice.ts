// The reader's own language choice, kept for a year: proxy.ts reads it, so a first visit's language (from where the
// reader is) never overrides a language the reader picked.
import type { Lang } from "./types.ts";

export const LANG_COOKIE = "ck_lang";
export const chooseLang = (lang: Lang) => { document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`; };
