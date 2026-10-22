import type { Metadata } from "next";
import { Anek_Gujarati, Geist } from "next/font/google";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Shell from "./Shell";
import styles from "./newsroom.module.css";

// Anek Gujarati for the interface's Gujarati, Geist for Latin letters and numbers
const gujarati = Anek_Gujarati({ subsets: ["gujarati", "latin"], weight: ["400", "500", "600", "700"], variable: "--nr-gu" });
const latin = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--nr-latin" });

export const metadata: Metadata = { title: "Capital Kranti", icons: { icon: "/newsroom-icon.svg" } };

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
