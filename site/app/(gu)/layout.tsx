import { Anek_Gujarati, Noto_Serif_Gujarati } from "next/font/google";
import { PREPAINT } from "@/components/Frame.tsx";
import "@/app/globals.css";

// The design system's two faces (DESIGN.md §2.2): Anek Gujarati for the interface, Noto Serif Gujarati for reading.
const ui = Anek_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-ui", axes: ["wdth"] });
const serif = Noto_Serif_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-serif" });

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="gu" className={`${ui.variable} ${serif.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: PREPAINT }} /></head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
