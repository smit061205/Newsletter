import s from "@/components/flagship/fl.module.css";

// a blank page in the flagship's colours while the next one comes (not the daily site's skeleton)
export default function Loading() { return <div className={s.root} aria-busy="true" />; }
