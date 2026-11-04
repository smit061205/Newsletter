// The active publication's profile (publications/<id>/profile.json), loaded
// and validated once. CK_PUBLICATION picks the paper; Capital Kranti by default.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ProfileSchema, type Profile } from "@ck/shared/profile";
import { publicationDir } from "./config.ts";

export const PUBLICATION = process.env.CK_PUBLICATION?.trim() || "capital-kranti";
export const PROFILE_DIR = publicationDir(PUBLICATION);

export const profile: Profile = ProfileSchema.parse(
  JSON.parse(readFileSync(path.join(PROFILE_DIR, "profile.json"), "utf8")),
);

/** A file named in the profile, relative to its folder. */
export const profilePath = (rel: string) => path.join(PROFILE_DIR, rel);

/** The date a day's paper carries: the next day's, for a paper made the evening before (profile issue.datedNextDay). */
export function printedDate(iso: string): string {
  if (!profile.issue.datedNextDay) return iso;
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
