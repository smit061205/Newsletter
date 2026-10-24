import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // site/ has its own installs and lockfile, apart from the repository's
  // workspaces (the desktop app's), so it is its own root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
