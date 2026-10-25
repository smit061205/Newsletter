// Every page Google should know, in both languages (stories, sections, the fixed pages).
import type { MetadataRoute } from "next";
import { issueDates, sitemapEntries } from "@/lib/db.ts";
import { SECTIONS } from "@/lib/sections.ts";
import { SITE_URL } from "@/lib/site.ts";
import { POLICY } from "@/views/Policy.tsx";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const both = (path: string, lastModified?: string) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`, lastModified,
    alternates: { languages: { gu: `${SITE_URL}${path === "/" ? "" : path}`, en: `${SITE_URL}/en${path === "/" ? "" : path}` } },
  });
  const [stories, days] = await Promise.all([sitemapEntries(), issueDates()]);
  return [
    both("/"), both("/latest"), both("/epaper"), both("/archive"),
    ...SECTIONS.map((k) => both(`/section/${k}`)),
    ...Object.keys(POLICY).map((p) => both(`/${p}`)),
    ...days.map((d) => both(`/archive/${d.date}`)),
    ...stories.map((s) => both(`/news/${s.id}`, s.updatedAt)),
  ];
}
