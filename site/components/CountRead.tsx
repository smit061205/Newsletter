"use client";
// Counts this story's opening once per browser (the "most read" list): the
// browser keeps the last 300 stories it has counted, and nothing else.
import { useEffect } from "react";

export default function CountRead({ id }: { id: string }) {
  useEffect(() => {
    try {
      const seen: string[] = JSON.parse(localStorage.getItem("ck-read") ?? "[]");
      if (seen.includes(id)) return;
      if (navigator.sendBeacon?.("/api/read", id)) localStorage.setItem("ck-read", JSON.stringify([...seen, id].slice(-300)));
    } catch { /* no storage: count nothing */ }
  }, [id]);
  return null;
}
