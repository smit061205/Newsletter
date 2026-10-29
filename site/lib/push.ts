// Breaking-news alerts on readers' phones and computers (ROADMAP §4: "web push alerts for breaking news (opt-in)";
// 30 Oct). Free: the browsers' own push services carry them. The site's key pair is made once, by whichever part of
// the site or engine needs it first, and kept in the database (never in the repository or a setting to copy). A story
// is breaking when the engine scores it 9.5 or more (a "lead"), and is sent once, while it is fresh; at most four a day,
// so an alert always means something.
import type { NeonQueryFunction } from "@neondatabase/serverless";
import webpush from "web-push";
import { href } from "./i18n.ts";
import { PAPER, SITE_URL } from "./site.ts";
import type { Lang } from "./types.ts";
import { count, prepared } from "./write.ts";

type Sql = NeonQueryFunction<false, false>;

/** A story that big is breaking news (the engine's "lead" level, engine/newsroom.ts levelOf). */
export const BREAKING = 9.5;
/** For how long a breaking story is breaking: the bar on every page, and an alert only within it. */
export const BREAKING_HOURS = 3;
const DAILY = 4;

/** The site's key pair for push messages: made the first time it's needed, then always the same. */
export async function pushKeys(sql: Sql): Promise<{ publicKey: string; privateKey: string }> {
  await prepared(sql);
  const [r] = await sql.query(`select value from state where key = 'push_keys'`);
  if (r) return JSON.parse(r.value as string);
  const k = webpush.generateVAPIDKeys();
  await sql.query(`insert into state (key, value) values ('push_keys', $1) on conflict (key) do nothing`, [JSON.stringify(k)]);
  const [kept] = await sql.query(`select value from state where key = 'push_keys'`);
  return JSON.parse(kept.value as string);
}

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }
const valid = (x: unknown): x is PushSub => {
  const s = x as PushSub;
  return typeof s?.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000
    && typeof s.keys?.p256dh === "string" && typeof s.keys?.auth === "string" && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
};

export async function subscribe(sql: Sql, sub: unknown, lang: Lang): Promise<boolean> {
  if (!valid(sub)) return false;
  await prepared(sql);
  await sql.query(`insert into push_subs (endpoint, keys, lang) values ($1, $2, $3) on conflict (endpoint) do update set keys = excluded.keys, lang = excluded.lang`,
    [sub.endpoint, JSON.stringify(sub.keys), lang]);
  return true;
}

export async function unsubscribe(sql: Sql, endpoint: string) {
  await sql.query(`delete from push_subs where endpoint = $1`, [endpoint]);
}

export interface Breaking { id: string; importance: number | null; publishedAt: string; headline: Record<Lang, string | null> }

/** A breaking story's alert, sent once to everyone who asked, each in their language (Gujarati where the story isn't
 *  translated yet). Returns how many it reached. */
export async function alertBreaking(sql: Sql, s: Breaking, log: (m: string) => void = () => {}): Promise<number> {
  if ((s.importance ?? 0) < BREAKING || Date.now() - Date.parse(s.publishedAt) > BREAKING_HOURS * 3600_000) return 0;
  await prepared(sql);
  const first = await sql.query(`insert into state (key, value) values ($1, now()::text) on conflict (key) do nothing returning key`, [`pushed:${s.id}`]);
  if (!first.length) return 0;
  if ((await count(sql, "push_alert")) > DAILY) { log(`  no alert: today's ${DAILY} are sent`); return 0; }
  const subs = await sql.query(`select endpoint, keys, lang from push_subs`);
  if (!subs.length) return 0;
  const k = await pushKeys(sql);
  const opts = { TTL: BREAKING_HOURS * 3600, urgency: "high" as const, vapidDetails: { subject: SITE_URL, publicKey: k.publicKey, privateKey: k.privateKey } };
  let sent = 0;
  for (const r of subs) {
    const lang = (["gu", "en", "hi"].includes(r.lang) ? r.lang : "gu") as Lang;
    const body = s.headline[lang] || s.headline.gu || "";
    const msg = JSON.stringify({ title: { gu: "તાજા સમાચાર", en: "Breaking news", hi: "ताज़ा ख़बर" }[lang] + ` · ${PAPER[lang].name}`, body, url: href(lang, `/news/${s.id}`), tag: s.id });
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: r.keys }, msg, opts);
      sent++;
    } catch (e) {
      // a phone that switched alerts off or uninstalled: forgotten
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await unsubscribe(sql, r.endpoint);
    }
  }
  log(`  breaking-news alert sent to ${sent} of ${subs.length}`);
  return sent;
}
