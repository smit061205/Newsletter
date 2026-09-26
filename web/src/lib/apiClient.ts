// Typed client for the backend contract (contract.ts). Every response is
// parsed through IssueRenderSchema before it's returned -- a mismatch
// between this codebase's assumptions and the real backend fails here, with
// a clear Zod error, not as a silently broken render three components away
// (docs/FRONTEND_ROADMAP.md Part B, "runtime schema validation: yes, strict").
//
// This file makes ONE real fetch call either way (mock or live) -- in mock
// mode, MSW intercepts that same call at the network layer (see mocks/), so
// this code never branches on env.backendMode itself. Swapping mock for the
// real backend (Part E step 10) is enabling/disabling the MSW server, not a
// change here.

import { env } from "./env";
import { IssueRenderSchema, type IssueRender } from "./contract";

// TBD with your brother (docs/FRONTEND_ROADMAP.md Part F) -- placeholder path.
const ISSUE_ENDPOINT_PATH = "/api/issue";

export async function fetchIssue(): Promise<IssueRender> {
  const url =
    env.backendMode === "live"
      ? `${env.backendApiUrl}${ISSUE_ENDPOINT_PATH}`
      : `http://mock-backend.local${ISSUE_ENDPOINT_PATH}`; // MSW intercepts this; never hits the network

  const res = await fetch(url, {
    headers: env.backendApiToken ? { Authorization: `Bearer ${env.backendApiToken}` } : undefined,
    cache: "no-store", // fetch-on-load, no caching a stale issue (Part B: "trigger model: fetch-on-load")
  });

  if (!res.ok) {
    throw new Error(`Backend returned ${res.status} ${res.statusText} for ${url}`);
  }

  const json = await res.json();
  const parsed = IssueRenderSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Backend response at ${url} did not match the expected contract (contract.ts):\n` +
        parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
    );
  }
  return parsed.data;
}
