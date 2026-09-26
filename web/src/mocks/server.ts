// Node-side MSW server -- started once for the whole process (see
// instrumentation.ts) so every server-side fetch (Server Components, route
// handlers) is intercepted while env.backendMode === "mock"
// (docs/FRONTEND_ROADMAP.md Part G). Not used at all in "live" mode.

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const mockServer = setupServer(...handlers);
