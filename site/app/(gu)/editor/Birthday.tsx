"use client";
// A leader's birthday on the editor page (lib/leaders.ts): the greeting picture in the paper's design, drawn here on
// the editor's phone or computer with the site's own Gujarati faces (a server can't shape Gujarati letters), to
// download or send; and the Gujarati email draft, to change, copy, or open in Gmail or the email app. Nothing is sent
// from here: the email goes only when the editor presses Send in their own mailbox.
import { useEffect, useState } from "react";
import s from "./editor.module.css";
import { W } from "./words.ts";

export interface BirthdayLeader { id: string; nameGu: string; nameEn: string; title: string; post: string; email: string; portrait: string; credit: string }

const SIZE = { w: 1080, h: 1350 };
const C = { bg: "#FDFDFC", ink: "#111114", soft: "#3f3f46", muted: "#5f5f66", brand: "#7f3894", tint: "#f2eaf5", navy: "#2e3192", cyan: "#0aaae4" };

const image = (src: string) => new Promise<HTMLImageElement>((ok, no) => {
  const i = new Image();
  if (/^https?:/.test(src)) i.crossOrigin = "anonymous";
  i.onload = () => ok(i);
  i.onerror = () => no(new Error("no picture"));
  i.src = src;
});

/** a line set as large as fits, from `size` down */
function fit(x: CanvasRenderingContext2D, text: string, font: (px: number) => string, size: number, width: number) {
  let px = size;
  x.font = font(px);
  while (px > 18 && x.measureText(text).width > width) { px -= 2; x.font = font(px); }
  return px;
}

async function draw(l: BirthdayLeader): Promise<Blob> {
  const root = getComputedStyle(document.documentElement);
  const ui = root.getPropertyValue("--font-ui").trim() || "sans-serif";
  const head = root.getPropertyValue("--font-head").trim() || ui;
  await Promise.all([
    document.fonts.load(`800 72px ${ui}`, "કેપિટલ ક્રાંતિ"), document.fonts.load(`600 40px ${ui}`, "પરિવાર"),
    document.fonts.load(`700 84px ${head}`, "જન્મદિવસની"),
  ]).catch(() => null);
  const portrait = l.portrait ? await image(l.portrait).catch(() => null) : null;

  const c = document.createElement("canvas");
  c.width = SIZE.w; c.height = SIZE.h;
  const x = c.getContext("2d")!;
  const mid = SIZE.w / 2;
  x.fillStyle = C.bg; x.fillRect(0, 0, SIZE.w, SIZE.h);
  x.textAlign = "center"; x.textBaseline = "alphabetic";

  // the paper's three colours along the top, the masthead, and a printed paper's rules under it
  const third = SIZE.w / 3;
  [C.brand, C.navy, C.cyan].forEach((col, i) => { x.fillStyle = col; x.fillRect(i * third, 0, third + 1, 14); });
  x.fillStyle = C.brand;
  x.font = `800 76px ${ui}`;
  x.fillText("કેપિટલ ક્રાંતિ", mid, 128);
  x.fillStyle = C.ink;
  x.fillRect(80, 158, SIZE.w - 160, 4);
  x.fillRect(80, 168, SIZE.w - 160, 1);

  // the portrait in a circle with the paper's purple round it (or the name's first letter when there's none)
  const cy = 470, r = 255;
  x.beginPath(); x.arc(mid, cy, r + 18, 0, Math.PI * 2); x.fillStyle = C.brand; x.fill();
  x.beginPath(); x.arc(mid, cy, r + 8, 0, Math.PI * 2); x.fillStyle = C.bg; x.fill();
  x.save();
  x.beginPath(); x.arc(mid, cy, r, 0, Math.PI * 2); x.clip();
  if (portrait) {
    // a square from the picture: the middle across, and nearer the top down (where a portrait's face is)
    const side = Math.min(portrait.naturalWidth, portrait.naturalHeight);
    const sx = (portrait.naturalWidth - side) / 2, sy = (portrait.naturalHeight - side) * 0.18;
    x.drawImage(portrait, sx, sy, side, side, mid - r, cy - r, 2 * r, 2 * r);
  } else {
    x.fillStyle = C.tint; x.fillRect(mid - r, cy - r, 2 * r, 2 * r);
    const first = [...new Intl.Segmenter("gu", { granularity: "grapheme" }).segment(l.nameGu)][0]?.segment ?? "";
    x.fillStyle = C.brand; x.font = `700 260px ${head}`; x.textBaseline = "middle";
    x.fillText(first, mid, cy + 10);
    x.textBaseline = "alphabetic";
  }
  x.restore();

  // the greeting, the name and the post
  x.fillStyle = C.ink;
  x.font = `700 84px ${head}`;
  x.fillText("જન્મદિવસની હાર્દિક", mid, 856);
  x.fillText("શુભેચ્છાઓ", mid, 956);
  x.fillStyle = C.brand;
  fit(x, `${l.title} ${l.nameGu}`, (px) => `700 ${px}px ${head}`, 68, SIZE.w - 160);
  x.fillText(`${l.title} ${l.nameGu}`, mid, 1062);
  if (l.post) {
    x.fillStyle = C.soft;
    fit(x, l.post, (px) => `500 ${px}px ${ui}`, 40, SIZE.w - 160);
    x.fillText(l.post, mid, 1122);
  }

  // the photo's credit (a free licence asks for it), and the paper's name at the foot
  if (portrait && l.credit) {
    x.fillStyle = C.muted; x.textAlign = "right";
    fit(x, `ફોટો: ${l.credit}`, (px) => `400 ${px}px ${ui}`, 20, SIZE.w - 160);
    x.fillText(`ફોટો: ${l.credit}`, SIZE.w - 80, 1188);
    x.textAlign = "center";
  }
  x.fillStyle = C.navy; x.fillRect(0, 1215, SIZE.w, SIZE.h - 1215);
  x.fillStyle = "#ffffff"; x.font = `600 44px ${ui}`;
  x.fillText("કેપિટલ ક્રાંતિ પરિવાર તરફથી", mid, 1298);

  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.92));
  if (!blob) throw new Error("no JPEG");
  return blob;
}

export default function Birthday({ lang, leader, subject: subject0, body: body0 }: { lang: "gu" | "en"; leader: BirthdayLeader; subject: string; body: string }) {
  const w = W[lang];
  const [pic, setPic] = useState<{ url: string; file: File } | "drawing" | "failed">("drawing");
  const [subject, setSubject] = useState(subject0);
  const [body, setBody] = useState(body0);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const fileName = `janmadivas-${(leader.nameEn || leader.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.jpg`;

  useEffect(() => {
    let url = "";
    draw(leader).then((b) => {
      const file = new File([b], fileName, { type: "image/jpeg" });
      url = URL.createObjectURL(b);
      setPic({ url, file });
      setCanShare(!!navigator.canShare?.({ files: [file] }));
    }).catch(() => setPic("failed"));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [leader, fileName]);

  const share = async () => {
    if (typeof pic !== "object") return;
    try { await navigator.share({ files: [pic.file], title: subject }); } catch { /* closed */ }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* not allowed */ }
  };
  const to = encodeURIComponent(leader.email);
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <article className={`${s.card} ${s.bday}`}>
      <h3>{leader.title} {leader.nameGu}{leader.post && <span className={s.when}> · {leader.post}</span>}</h3>
      <div className={s.bdayGrid}>
        <div className={s.greet}>
          {typeof pic === "object"
            ? <img src={pic.url} alt={`${w.greetingOf} ${leader.title} ${leader.nameGu}`} width={1080} height={1350} />
            : <p className={s.state} role="status">{pic === "drawing" ? w.drawing : w.drawFailed}</p>}
          {typeof pic === "object" && <div className={s.buttons}>
            <a className={s.yes} href={pic.url} download={fileName}>{w.download}</a>
            {canShare && <button type="button" className={s.ghost} onClick={share}>{w.share}</button>}
          </div>}
        </div>
        <div className={`${s.form} ${s.mail}`}>
          <p className={s.sub}>{w.emailDraft}</p>
          {!leader.email && <p className={s.why}>{w.noEmail}</p>}
          <label>{w.subject}<input className={s.select} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <textarea className={s.bodyBox} rows={10} value={body} onChange={(e) => setBody(e.target.value)} aria-label={w.emailDraft} />
          <div className={s.buttons}>
            <a className={s.yes} href={gmail} target="_blank" rel="noopener">{w.openGmail}</a>
            <button type="button" className={s.ghost} onClick={copy}>{copied ? w.copied : w.copy}</button>
            <a className={s.link} href={mailto}>{w.openMail}</a>
          </div>
          <p className={s.help}>{w.attachNote}</p>
        </div>
      </div>
    </article>
  );
}
