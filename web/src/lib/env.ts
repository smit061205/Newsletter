// Single place that reads backend-connection env vars (docs/FRONTEND_ROADMAP.md
// Part G, "Env config") -- nothing about the backend's URL or auth is
// hardcoded anywhere else. Defaults to mock mode so a fresh checkout with no
// .env.local still runs (against MSW fixtures) instead of failing.
// "static" reads issues published as files into public/issues (no backend).

export type BackendMode = "mock" | "live" | "static";

function readMode(): BackendMode {
  const raw = process.env.BACKEND_API_MODE?.trim().toLowerCase();
  if (raw === "live" || raw === "static") return raw;
  if (raw && raw !== "mock") {
    throw new Error(`BACKEND_API_MODE must be "mock", "live" or "static", got ${JSON.stringify(raw)}`);
  }
  return "mock";
}

export const env = {
  backendMode: readMode(),
  backendApiUrl: process.env.BACKEND_API_URL ?? "",
  backendApiToken: process.env.BACKEND_API_TOKEN ?? "",
};

if (env.backendMode === "live" && !env.backendApiUrl) {
  throw new Error(
    "BACKEND_API_MODE=live but BACKEND_API_URL is not set -- fill it in .env.local " +
      "(see .env.local.example) before switching off mock mode."
  );
}
