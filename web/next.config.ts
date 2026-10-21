import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The repo is an npm workspace: the render contract and plotter live in
  // ../shared (also used by the backend), so the root is the repo, not web/.
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  transpilePackages: ["@ck/shared"],
};

export default nextConfig;
