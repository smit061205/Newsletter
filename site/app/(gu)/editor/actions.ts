"use server";
// The editor page's buttons (lib/editor.ts). Each one checks the sign-in itself: these
// can be called directly, not only from the page.
import { cookies } from "next/headers";
import { refresh, revalidatePath } from "next/cache";
import { db } from "@/lib/db.ts";
import { redirect } from "next/navigation";
import { COOKIE, decideFeature, decideStory, editorOf, restoreStory, saveFeature, saveStory, setPaused, withdrawStory, type Words } from "@/lib/editor.ts";

async function signedIn() {
  const who = editorOf((await cookies()).get(COOKIE)?.value);
  if (!who) throw new Error("not signed in");
  return { who, sql: db() };
}
/** the site's pages renewed, and this page shown again */
function renew(aavtikal = false) {
  for (const p of ["/", "/en", "/hi"]) revalidatePath(p, "layout");
  if (aavtikal) for (const p of ["/aavtikal", "/en/aavtikal", "/hi/aavtikal"]) revalidatePath(p, "layout");
  refresh();
}

export async function approveStory(id: string) { const { who, sql } = await signedIn(); if (sql) await decideStory(sql, id, true, who); renew(); }
export async function rejectStory(id: string) { const { who, sql } = await signedIn(); if (sql) await decideStory(sql, id, false, who); renew(); }
export async function removeStory(id: string) { const { who, sql } = await signedIn(); if (sql) await withdrawStory(sql, id, who); renew(); }
export async function publishFeature(id: string) { const { sql } = await signedIn(); if (sql) await decideFeature(sql, id, "published"); renew(true); }
export async function removeFeature(id: string) { const { sql } = await signedIn(); if (sql) await decideFeature(sql, id, "withdrawn"); renew(true); }
export async function pauseEngine(paused: boolean) { const { sql } = await signedIn(); if (sql) await setPaused(sql, paused); refresh(); }
export async function putBackStory(id: string) { const { sql } = await signedIn(); if (sql) await restoreStory(sql, id); renew(); }

const words = (f: FormData): Words => {
  const v = (k: string) => String(f.get(k) ?? "").replace(/\r\n/g, "\n").trim();
  return { headline: v("headline"), deck: v("deck"), body: v("body"), caption: v("caption") };
};
/** the editor's changes saved; back to the list, which says so */
export async function changeStory(id: string, back: string, f: FormData) {
  const { who, sql } = await signedIn();
  const w = words(f);
  if (!w.headline || !w.body) redirect(`/editor/story/${encodeURIComponent(id)}?${back ? `${back}&` : ""}missing=1`);
  const ok = sql ? await saveStory(sql, id, w, who) : false;
  renew();
  redirect(`/editor?${back ? `${back}&` : ""}saved=${ok ? "1" : "0"}#news`);
}
export async function changeFeature(id: string, back: string, f: FormData) {
  const { sql } = await signedIn();
  const w = words(f);
  if (!w.headline || !w.body) redirect(`/editor/feature/${encodeURIComponent(id)}?${back ? `${back}&` : ""}missing=1`);
  const ok = sql ? await saveFeature(sql, id, w) : false;
  renew(true);
  redirect(`/editor?${back ? `${back}&` : ""}saved=${ok ? "1" : "0"}#aavtikal`);
}
