// Every page Google should know, in its three languages (stories, sections, the fixed pages).
import type { MetadataRoute } from "next";
import { issueDates, sitemapEntries } from "@/lib/db.ts";
import { SECTIONS } from "@/lib/sections.ts";
import { SITE_URL } from "@/lib/site.ts";
import { POLICY } from "@/views/Policy.tsx";
import { BEATS, features } from "@/lib/flagship.ts";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const both = (path: string, lastModified?: string) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`, lastModified,
    alternates: { languages: { gu: `${SITE_URL}${path === "/" ? "" : path}`, en: `${SITE_URL}/en${path === "/" ? "" : path}`, hi: `${SITE_URL}/hi${path === "/" ? "" : path}` } },
  });
  const [stories, days, flagship] = await Promise.all([sitemapEntries(), issueDates(), features({ limit: 500 })]);
  return [
    both("/"), both("/latest"), both("/epaper"), both("/archive"),
    ...SECTIONS.map((k) => both(`/section/${k}`)),
    ...Object.keys(POLICY).map((p) => both(`/${p}`)),
    ...days.map((d) => both(`/archive/${d.date}`)),
    ...stories.map((s) => both(`/news/${s.id}`, s.updatedAt)),
    both("/aavtikal"), ...BEATS.map((b) => both(`/aavtikal/${b}`)),
    ...flagship.map((f) => both(`/aavtikal/p/${f.id}`, f.updatedAt)),
  ];
}
