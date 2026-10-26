"use client";
// A story's photo, opened full screen with a tap (as news sites do): a dialog
// with the photo as large as the screen allows, its caption, and a close
// button; Escape, the button or a tap outside the photo closes it.
import { useRef } from "react";

export default function PhotoZoom({ src, width, height, alt, caption, label, close, children }:
  { src: string; width: number; height: number; alt: string; caption: string; label: string; close: string; children: React.ReactNode }) {
  const d = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="zoomable" aria-label={label} onClick={() => d.current?.showModal()}>
        {children}
        <span className="zoomhint" aria-hidden="true">
          <svg className="i" viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
        </span>
      </button>
      <dialog ref={d} className="lightbox" onClick={(e) => { if (e.target === d.current) d.current?.close(); }}>
        <figure>
          <img src={src} width={width} height={height} alt={alt} />
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
        <button type="button" className="lbclose" aria-label={close} onClick={() => d.current?.close()}>
          <svg className="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </dialog>
    </>
  );
}
