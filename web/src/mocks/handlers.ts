// MSW request handlers implementing the DRAFT backend contract (contract.ts)
// against the fixtures in fixtures.ts. Intercepts the exact same fetch call
// apiClient.ts makes for real (docs/FRONTEND_ROADMAP.md Part E step 5) --
// swapping to the real backend later means disabling this server, not
// rewriting apiClient.ts.

import { http, HttpResponse } from "msw";
import { selectFixture } from "./fixtures";

export const handlers = [
  http.get("http://mock-backend.local/api/issue", () => {
    return HttpResponse.json(selectFixture());
  }),
];
