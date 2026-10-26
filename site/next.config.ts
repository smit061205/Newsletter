import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // site/ has its own installs and lockfile, apart from the repository's
  // workspaces (the desktop app's), so it is its own root.
  turbopack: {
    root: __dirname,
  },
  // two root layouts (Gujarati, English): a web address matching neither gets app/global-not-found.tsx
  // the service worker is always fetched fresh, so a new release reaches every phone
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] }];
  },
  experimental: {
    globalNotFound: true,
  },
};

export default nextConfig;
