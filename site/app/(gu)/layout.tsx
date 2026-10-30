import { Anek_Gujarati, Hind_Vadodara, Noto_Serif_Gujarati } from "next/font/google";
import { PREPAINT } from "@/components/Frame.tsx";
import "@/app/globals.css";

// The design system's two faces (DESIGN.md §2.2): Anek Gujarati for the interface, Noto Serif Gujarati for reading.
// None is loaded ahead (the user, 30 Oct: every page was sent all 22 font files, 2.1 MB, the Hindi ones too): a browser fetches
// only those a page uses. The light Anek has no width axis; the wide name and Aavtikal's condensed headlines are small files of our own (globals.css).
const ui = Anek_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-ui", preload: false });
const serif = Noto_Serif_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-serif", preload: false });
// headlines (29 Oct): Hind Vadodara, upright and strong like a printed paper's
const head = Hind_Vadodara({ subsets: ["gujarati", "latin"], weight: ["600", "700"], variable: "--font-head", preload: false });

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="gu" data-scroll-behavior="smooth" className={`${ui.variable} ${serif.variable} ${head.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: PREPAINT }} /></head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
