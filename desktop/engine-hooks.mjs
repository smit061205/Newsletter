// Inside the app, the engine's shared code (@ck/shared) is loaded from
// app-engine/shared: Node runs TypeScript only outside node_modules, and the
// repository's workspace link (node_modules/@ck/shared -> shared) can't
// travel in an installer. Loaded with --import by main.js.
import { register } from "node:module";

register("data:text/javascript," + encodeURIComponent(`
  const SHARED = ${JSON.stringify(new URL("./shared/package.json", import.meta.url).href)};
  let exportsMap;
  export async function resolve(specifier, context, next) {
    const m = specifier.match(/^@ck\\/shared(\\/.*)?$/);
    if (!m) return next(specifier, context);
    if (!exportsMap) {
      const { readFileSync } = await import("node:fs");
      exportsMap = JSON.parse(readFileSync(new URL(SHARED), "utf8")).exports;
    }
    const target = exportsMap["." + (m[1] ?? "")];
    if (!target) throw new Error("@ck/shared has no export " + specifier);
    return { url: new URL(target, SHARED).href, shortCircuit: true };
  }
`));
