// The website as an app on a phone's home screen (the BBC's World Service
// sites do this for readers on slow networks); public/sw.js keeps it readable offline.
import type { MetadataRoute } from "next";
import { PAPER } from "@/lib/site.ts";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PAPER.gu.name, short_name: PAPER.gu.name, description: PAPER.gu.tagline,
    lang: "gu", start_url: "/?app=1", scope: "/", display: "standalone",
    background_color: "#FDFDFC", theme_color: "#7f3894",
    icons: [
      { src: "/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "તાજા સમાચાર", url: "/latest" },
      { name: "ઈ-પેપર", url: "/epaper" },
    ],
  };
}
