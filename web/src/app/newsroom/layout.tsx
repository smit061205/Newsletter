import type { Metadata } from "next";
import { Noto_Sans_Gujarati } from "next/font/google";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Shell from "./Shell";
import styles from "./newsroom.module.css";

const gujarati = Noto_Sans_Gujarati({ subsets: ["gujarati", "latin"], weight: ["400", "500", "600", "700"], variable: "--nr-font" });

export const metadata: Metadata = { title: "Capital Kranti Newsroom" };

// The newsroom runs only on the paper's own computer (the Capital Kranti app
// sets NEWSROOM=1); on the public website it doesn't exist.
export default async function NewsroomLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (process.env.NEWSROOM !== "1") notFound();
  return (
    <div className={`${styles.root} ${gujarati.variable}`}>
      <Shell>{children}</Shell>
    </div>
  );
}
