import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The repo is an npm workspace: the render contract and plotter live in
  // ../shared (also used by the backend), so the root is the repo, not web/.
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  transpilePackages: ["@ck/shared"],
  // static mode reads the published issues' JSON at request time
  // (src/lib/published.ts); the images and PDFs are served as public files
  outputFileTracingIncludes: {
    "/*": ["public/issues/**/*.json"],
    "/**": ["public/issues/**/*.json"],
  },
};

export default nextConfig;
