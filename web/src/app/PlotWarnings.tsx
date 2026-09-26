"use client";

// Everything the plotter noticed about the backend's layout: problems visible
// in the JSON itself (passed in from the server) plus what each page's probe
// reports once it has laid out -- text running past its box, images or fonts
// that failed to load. Report only; nothing on the page is changed to hide them.
import { useEffect, useState } from "react";
import type { PlotWarning } from "@/lib/plot";

export function PlotWarnings({ initial }: { initial: PlotWarning[] }) {
  const [live, setLive] = useState<Record<number, PlotWarning[]>>({});

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "plot-warnings") return;
      setLive((prev) => ({ ...prev, [e.data.page]: e.data.warnings as PlotWarning[] }));
    };
    window.addEventListener("message", onMessage);
    // Pages that finished before this listener existed already posted their
    // message; read their results straight from the (same-origin) iframes.
    const done: Record<number, PlotWarning[]> = {};
    document.querySelectorAll("iframe").forEach((frame) => {
      const w = frame.contentWindow as (Window & { __plotDone?: boolean; __plotWarnings?: PlotWarning[] }) | null;
      if (w?.__plotDone && w.__plotWarnings) {
        const page = Number(w.document.body.dataset.page);
        done[page] = w.__plotWarnings;
      }
    });
    if (Object.keys(done).length) setLive((prev) => ({ ...done, ...prev }));
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const all = [...initial, ...Object.values(live).flat()].sort((a, b) => a.page - b.page);
  if (!all.length) return null;
  return (
    <section
      style={{
        width: 900, maxWidth: "100%", background: "#fff8e6", border: "1px solid #e8c56b", borderRadius: 6,
        padding: "12px 16px", fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#3d2e00",
      }}
    >
      <strong>
        {all.length} layout warning{all.length === 1 ? "" : "s"} from the backend&apos;s positions
      </strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {all.map((w, i) => (
          <li key={i}>
            Page {w.page}
            {w.articleId ? ` · ${w.articleId}` : ""}
            {w.elementId ? ` · ${w.elementId}` : ""}: {w.kind} — {w.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
