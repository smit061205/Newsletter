// Capital Kranti backend: builds each day's issue as render-contract JSON
// (shared/src/contract.ts, docs/RENDER_CONTRACT.md) -- fetch the Gujarat
// Information Department's releases, rewrite them, lay out every page, serve
// the result to the website. Run with Node's built-in TypeScript support:
//   node --experimental-strip-types backend/src/index.ts
import { IssueRenderSchema } from "@ck/shared/contract";

console.log("backend ready; contract has", Object.keys(IssueRenderSchema.shape).length, "top-level fields");
