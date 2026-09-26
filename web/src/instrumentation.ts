// Starts the MSW mock server once when the Next.js server process boots
// (docs/FRONTEND_ROADMAP.md Part E step 5) -- only in mock mode, and only
// in the Node runtime (not the edge runtime, which MSW's node server
// doesn't support). Real backend calls (env.backendMode === "live") never
// touch this file's effects.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { env } = await import("./lib/env");
  if (env.backendMode !== "mock") return;

  const { mockServer } = await import("./mocks/server");
  mockServer.listen({ onUnhandledRequest: "bypass" });
}
