import type { Metadata } from "next";
import { Anek_Gujarati, Noto_Serif_Gujarati } from "next/font/google";
import "./globals.css";

// The two faces of the design system (docs/website/DESIGN.md §2.2):
// Anek Gujarati for the interface, Noto Serif Gujarati for reading.
const ui = Anek_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-ui", axes: ["wdth"] });
const serif = Noto_Serif_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "કેપિટલ ક્રાંતિ",
  description: "કેપિટલ ક્રાંતિ, ગાંધીનગરનું ગુજરાતી દૈનિક: સમાજનો વિવેકપૂર્ણ દ્રષ્ટિકોણ.",
  // a placeholder until phase A's site is in place: kept out of search engines
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="gu" className={`${ui.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
