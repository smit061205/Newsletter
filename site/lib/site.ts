// The website's own constants. The address moves to capitalkranti.co.in when
// the domain points here (ROADMAP §6.0 item 3); until then the free Vercel
// address, which search engines are asked not to index (it would compete with
// the real one later).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://capital-kranti.vercel.app").replace(/\/$/, "");
export const INDEXABLE = !/\.vercel\.app$/.test(new URL(SITE_URL).hostname);
export const PAPER = {
  gu: { name: "કેપિટલ ક્રાંતિ", tagline: "સમાજનો વિવેકપૂર્ણ દ્રષ્ટિકોણ", place: "ગાંધીનગર" },
  en: { name: "Capital Kranti", tagline: "A thoughtful view of society", place: "Gandhinagar" },
  hi: { name: "कैपिटल क्रांति", tagline: "समाज का विवेकपूर्ण दृष्टिकोण", place: "गांधीनगर" },
  rni: "54922/93",
  email: "capitalkranti@gmail.com",
  phone: "98256 08744",
  founded: 1992,
};
