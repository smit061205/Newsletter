import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Shell from "./Shell";
import styles from "./newsroom.module.css";

// Anek Gujarati for the interface's Gujarati, Geist for Latin letters and numbers --
// the files themselves (app/fonts, SIL OFL), so a build never downloads them
// (24 Oct: Google Fonts not answering failed the Windows installer's build)
const gujarati = localFont({ src: "../fonts/AnekGujarati-Variable.woff2", weight: "100 800", variable: "--nr-gu" });
const latin = localFont({ src: "../fonts/Geist-Variable.woff2", weight: "100 900", variable: "--nr-latin" });

export const metadata: Metadata = { title: "Capital Kranti", icons: { icon: "/newsroom-icon.png" } };

// The newsroom runs only on the paper's own computer (the Capital Kranti app
// sets NEWSROOM=1); on the public website it doesn't exist.
export default async function NewsroomLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (process.env.NEWSROOM !== "1") notFound();
  return (
    <div className={`${styles.root} ${gujarati.variable} ${latin.variable}`}>
      <Shell>{children}</Shell>
    </div>
  );
}
