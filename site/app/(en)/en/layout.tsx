import { Anek_Gujarati, Hind_Vadodara, Noto_Serif_Gujarati } from "next/font/google";
import { PREPAINT } from "@/components/Frame.tsx";
import "@/app/globals.css";

// The design system's two faces (DESIGN.md §2.2): Anek Gujarati for the interface, Noto Serif Gujarati for reading.
const ui = Anek_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-ui", axes: ["wdth"] });
const serif = Noto_Serif_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-serif" });
// headlines (29 Oct): Hind Vadodara, upright and strong like a printed paper's
const head = Hind_Vadodara({ subsets: ["gujarati", "latin"], weight: ["500", "600", "700"], variable: "--font-head" });

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${serif.variable} ${head.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: PREPAINT }} /></head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
