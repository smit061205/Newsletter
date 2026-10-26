"use client";
// Back to the top of a long page: appears once the reader is well down it.
import { useEffect, useState } from "react";

export default function ToTop({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 1400);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button type="button" className={`totop${show ? " on" : ""}`} aria-label={label} tabIndex={show ? 0 : -1}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
      <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    </button>
  );
}
