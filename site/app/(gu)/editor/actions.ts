"use server";
// The editor page's buttons (lib/editor.ts). Each one checks the sign-in itself: these
// can be called directly, not only from the page.
import { cookies } from "next/headers";
import { refresh, revalidatePath } from "next/cache";
import { db } from "@/lib/db.ts";
import { COOKIE, decideFeature, decideStory, editorOf, setPaused, withdrawStory } from "@/lib/editor.ts";

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
