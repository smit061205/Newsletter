import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// the font files themselves (app/fonts, SIL OFL): a build downloads nothing
const geistSans = localFont({ src: "./fonts/Geist-Variable.woff2", weight: "100 900", variable: "--font-geist-sans" });
const geistMono = localFont({ src: "./fonts/GeistMono-Variable.woff2", weight: "100 900", variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Capital Kranti",
  description: "Gujarati daily newspaper, Gandhinagar",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Newspaper pages bring their own @font-face (the engine's page HTML,
    // served by /api/render) -- the same font files the PDF prints with.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
