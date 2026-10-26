"use client";
// A story's time as a reader wants it: "૧૨ મિનિટ પહેલાં" for the last hours,
// "આજે ૯:૧૫"-style for today, a date for older ones. The page is kept ready
// for an hour on the server, so the server writes the clock time and the
// reader's browser turns it into "how long ago", and keeps it current.
import { useEffect, useState } from "react";
import type { Lang } from "../lib/types.ts";
import { ago } from "../lib/format.ts";
import { t } from "../lib/i18n.ts";

export default function TimeAgo({ iso, lang, fallback }: { iso: string; lang: Lang; fallback: string }) {
  const [text, setText] = useState(fallback);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const tick = () => { setText(ago(iso, lang) ?? fallback); setFresh(Date.now() - Date.parse(iso) < 3600_000); };
    tick();
    const k = setInterval(tick, 60_000);
    return () => clearInterval(k);
  }, [iso, lang, fallback]);
  // a story from the last hour carries a pulsing mark
  return (
    <time dateTime={iso} suppressHydrationWarning className={fresh ? "fresh" : undefined}>
      {fresh && <span className="livedot" aria-label={t(lang, "live")} />}{text}
    </time>
  );
}
