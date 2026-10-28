// The website's own settings (kept here, not in the paper's profile: the app is
// left alone): its address, the free models its hourly run tags and translates
// with (tried in order), and the free plans' daily ceilings it keeps under.
export const WEBSITE = {
  url: "https://capital-kranti.vercel.app",
  freeModels: ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"],
  // Gemma through Google's own API with the paper's free key (GOOGLE_AI_KEY), tried first;
  // the daily ceiling stays under the free tier's (about 1,500 a day per Gemma, 26 Oct)
  // (26 Oct, measured by engine/aiprobe.ts: the 26b answers a story in 7 s when told to think
  // minimally, 100 s otherwise; the 31b refuses that setting and is slower, so it checks)
  googleModels: ["gemma-4-26b-a4b-it", "gemma-4-31b-it"],
  googleThinking: { "gemma-4-26b-a4b-it": { thinkingLevel: "minimal" } } as Record<string, Record<string, unknown>>,
  dailyGoogleRequests: 1400,
  dailyFreeRequests: 900,
  dailyUploads: 50,
  // Aavtikal's desk (engine/desk.ts; the user, 29 Oct): deep explainers for AI, Tech and Science (never Politics),
  // written by Gemini Flash on its free tier (about 20 requests a day), 10 a day; more on the days named
  deskBeats: ["ai", "tech", "science"] as const,
  deskDaily: 10,
  deskDays: { "2026-10-29": 20 } as Record<string, number>,
  flashModels: ["gemini-3.8-flash", "gemini-3.8-flash-latest"],
  dailyFlashRequests: 20,
};
