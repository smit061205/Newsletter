import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // site/ has its own installs and lockfile, apart from the repository's
  // workspaces (the desktop app's), so it is its own root.
  turbopack: {
    root: __dirname,
  },
  // two root layouts (Gujarati, English): a web address matching neither gets app/global-not-found.tsx
  experimental: {
    globalNotFound: true,
  },
};

export default nextConfig;
