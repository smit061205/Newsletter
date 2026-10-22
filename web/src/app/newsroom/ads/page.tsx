"use client";
// જાહેરાત / Ads: book an ad -- its image, its size, its page and the days
// it runs. The layout places it at the foot of its page. A day with no ads
// booked prints the 8 August ads as stand-ins.
import { useCallback, useEffect, useState } from "react";
import { call, media, type AdRow } from "../api";
import { useDay } from "../Shell";
import styles from "../newsroom.module.css";

const WEEKDAYS = ["રવિ", "સોમ", "મંગળ", "બુધ", "ગુરુ", "શુક્ર", "શનિ"];
const toBase64 = (f: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = () => bad(new Error("couldn't read that file"));
  r.readAsDataURL(f);
});

export default function Ads() {
  const { date } = useDay();
  const [ads, setAds] = useState<AdRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [cols, setCols] = useState(4);
  const [heightCm, setHeightCm] = useState(10);
  const [page, setPage] = useState(4);
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => { call<AdRow[]>(`/api/ads?date=${date}`).then(setAds).catch((e) => setError(e.message)); }, [date]);
  useEffect(() => { setFrom(date); setTo(date); load(); }, [date, load]);

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setNote("");
    if (!file) return setError("Choose the ad's image first (JPG or PNG).");
    try {
      const got = await call<{ booked: string[] }>("/api/ads", { json: { name: file.name, base64: await toBase64(file), cols, heightCm, page, from, to, weekdays } });
      setNote(`Booked on ${got.booked.length} day${got.booked.length === 1 ? "" : "s"} (${got.booked[0]}${got.booked.length > 1 ? ` to ${got.booked.at(-1)}` : ""}). Build the day again to see it placed.`);
      setFile(null);
      load();
    } catch (err) { setError((err as Error).message); }
  };
  const remove = async (id: string) => {
    setError("");
    try { await call(`/api/ads/${encodeURIComponent(id)}`, { method: "DELETE" }); load(); } catch (e) { setError((e as Error).message); }
  };
  const standIns = ads.length > 0 && ads.every((a) => !a.url.startsWith("/media/ads/"));

  return (
    <div className={styles.twoCol}>
      <section className={styles.panel}>
        <h2>નવી જાહેરાત <small>Book an ad</small></h2>
        <form className={styles.fields} onSubmit={book}>
          <label>છબી <small>The ad (JPG or PNG, as it should print)</small><input type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          <div className={styles.inline}>
            <label>પહોળાઈ <small>Width, columns (1-8)</small><input type="number" min={1} max={8} value={cols} onChange={(e) => setCols(Number(e.target.value))} /></label>
            <label>ઊંચાઈ <small>Height, cm</small><input type="number" min={1} max={50} step={0.5} value={heightCm} onChange={(e) => setHeightCm(Number(e.target.value))} /></label>
            <label>પાનું <small>Page</small>
              <select value={page} onChange={(e) => setPage(Number(e.target.value))}>{[1, 2, 3, 4].map((p) => <option key={p}>{p}</option>)}</select>
            </label>
          </div>
          <div className={styles.inline}>
            <label>થી <small>From</small><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>સુધી <small>To</small><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <fieldset className={styles.weekdays}>
            <legend>ફક્ત આ દિવસે <small>Only on these days (none ticked: every day)</small></legend>
            {WEEKDAYS.map((w, i) => (
              <label key={w}><input type="checkbox" checked={weekdays.includes(i)} onChange={(e) => setWeekdays(e.target.checked ? [...weekdays, i] : weekdays.filter((x) => x !== i))} />{w}</label>
            ))}
          </fieldset>
          <button className={styles.primary} type="submit">બુક કરો · Book it</button>
          {note && <p className={styles.good}>{note}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>
      </section>
      <section className={styles.panel}>
        <h2>આ દિવસની જાહેરાતો <small>Ads on {date}</small></h2>
        {standIns && <p className={styles.muted}>None booked: the paper prints the 8 August ads as stand-ins. Booking one replaces them for that day.</p>}
        <ul className={styles.adList}>
          {ads.map((a) => (
            <li key={a.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media(a.url)} alt="" />
              <span>Page {a.page}</span>
              {a.url.startsWith("/media/ads/") && <button className={styles.danger} onClick={() => remove(a.id)}>Remove</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
