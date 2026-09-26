import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    // Newspaper pages bring their own @font-face (the engine's page HTML,
    // served by /api/render) -- the same font files the PDF prints with.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
