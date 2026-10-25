// The website's own settings (kept here, not in the paper's profile: the app is
// left alone): its address, the free models its hourly run tags and translates
// with (tried in order), and the free plans' daily ceilings it keeps under.
export const WEBSITE = {
  url: "https://capital-kranti.vercel.app",
  freeModels: ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"],
  dailyFreeRequests: 900,
  dailyUploads: 50,
};
