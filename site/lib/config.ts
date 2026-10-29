// The website's own settings (kept here, not in the paper's profile: the app is
// left alone): its address, the free models its hourly run tags and translates
// with (tried in order), and the free plans' daily ceilings it keeps under.
export const WEBSITE = {
  url: "https://capital-kranti.vercel.app",
  freeModels: ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"],
  // Gemma through Google's own API with the paper's free key (GOOGLE_AI_KEY), tried first;
  // the daily ceiling stays under the free tier's (14,400 a day for each Gemma, AI Studio 29 Oct; it was 1,400 from an
  // older reading, and the engine stopped writing once it was reached: the minute's 16,000 tokens is the real limit)
  // (26 Oct, measured by engine/aiprobe.ts: the 26b answers a story in 7 s when told to think
  // minimally, 100 s otherwise; the 31b refuses that setting and is slower, so it checks)
  googleModels: ["gemma-4-26b-a4b-it", "gemma-4-31b-it"],
  googleThinking: { "gemma-4-26b-a4b-it": { thinkingLevel: "minimal" } } as Record<string, Record<string, unknown>>,
  dailyGoogleRequests: 12000,
  dailyFreeRequests: 900,
  dailyUploads: 50,
  // Aavtikal's desk (engine/desk.ts; the user, 29 Oct): deep explainers for AI, Tech and Science (never Politics),
  // written by Gemini Flash on Google's free tier, 15 a day (the user, 30 Oct; 10 before); more on the days named
  deskBeats: ["ai", "tech", "science"] as const,
  deskDaily: 15,
  deskDays: { "2026-10-29": 20 } as Record<string, number>,
  // each model's own free requests a day (AI Studio, 29 Oct), used in order: the writers (3.6 when 3.8's
  // are used or it is busy, then 3 (2.5 is listed but no longer served to new keys): Google's busy spells used 40 requests for 6 articles on 29 Oct) and the translators (Gemma's 16,000 tokens a minute is too
  // little for a long article)
  gemini: {
    writer: [{ id: "gemini-3.8-flash", daily: 20 }, { id: "gemini-3.6-flash", daily: 20 }, { id: "gemini-3-flash", daily: 20 }],
    lite: [{ id: "gemini-3.5-flash-lite", daily: 500 }, { id: "gemini-3.1-flash-lite", daily: 500 }],
  },
};
