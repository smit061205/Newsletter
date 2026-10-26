"use client";
// A story's time as a reader wants it: "૧૨ મિનિટ પહેલાં" for the last hours,
// "આજે ૯:૧૫"-style for today, a date for older ones. The page is kept ready
// for an hour on the server, so the server writes the clock time and the
// reader's browser turns it into "how long ago", and keeps it current.
import { useEffect, useState } from "react";
import type { Lang } from "../lib/types.ts";
import { ago } from "../lib/format.ts";

export default function TimeAgo({ iso, lang, fallback }: { iso: string; lang: Lang; fallback: string }) {
  const [text, setText] = useState(fallback);
  useEffect(() => {
    const tick = () => setText(ago(iso, lang) ?? fallback);
    tick();
    const k = setInterval(tick, 60_000);
    return () => clearInterval(k);
  }, [iso, lang, fallback]);
  return <time dateTime={iso} suppressHydrationWarning>{text}</time>;
}
