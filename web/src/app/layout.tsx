import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ALL_FONT_VARIABLES } from "@/lib/fonts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Capital Kranti",
  description: "Gujarati daily newspaper, Gandhinagar",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Real self-hosted calibrated fonts (src/lib/fonts.ts, next/font/local),
    // not a Google Fonts CDN stand-in -- see fonts.ts for why that matters
    // (the website preview must use the SAME font files the PDF prints with).
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${ALL_FONT_VARIABLES}`}>
      <body>{children}</body>
    </html>
  );
}
