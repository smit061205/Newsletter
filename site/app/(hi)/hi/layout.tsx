import { Anek_Devanagari, Anek_Gujarati, Noto_Serif_Devanagari, Noto_Serif_Gujarati } from "next/font/google";
import { PREPAINT } from "@/components/Frame.tsx";
import "@/app/globals.css";

// The design system's two faces (DESIGN.md §2.2) in Devanagari for the Hindi pages, with the
// Gujarati ones behind them (a story not yet in Hindi is shown in Gujarati): globals.css, html[lang="hi"].
const uiHi = Anek_Devanagari({ subsets: ["devanagari", "latin"], variable: "--font-ui-hi", axes: ["wdth"] });
const serifHi = Noto_Serif_Devanagari({ subsets: ["devanagari", "latin"], variable: "--font-serif-hi" });
const ui = Anek_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-ui", axes: ["wdth"] });
const serif = Noto_Serif_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-serif" });

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hi" className={`${uiHi.variable} ${serifHi.variable} ${ui.variable} ${serif.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: PREPAINT }} /></head>
      <body>{children}</body>
    </html>
  );
}
