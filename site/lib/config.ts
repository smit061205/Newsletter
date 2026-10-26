// The website's own settings (kept here, not in the paper's profile: the app is
// left alone): its address, the free models its hourly run tags and translates
// with (tried in order), and the free plans' daily ceilings it keeps under.
export const WEBSITE = {
  url: "https://capital-kranti.vercel.app",
  freeModels: ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"],
  // Gemma through Google's own API with the paper's free key (GOOGLE_AI_KEY), tried first;
  // the daily ceiling stays under the free tier's (about 1,500 a day per Gemma, 26 Oct)
  googleModels: ["gemma-4-31b-it", "gemma-4-26b-a4b-it"],
  dailyGoogleRequests: 1400,
  dailyFreeRequests: 900,
  dailyUploads: 50,
};
