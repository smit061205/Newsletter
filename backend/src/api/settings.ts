// The newsroom's settings and dashboard: /api/status, /api/settings, the Telegram
// bot's photos, the data folder's size (tidy.ts) and the backups (backup.ts);
// the keys kept in the settings file, and the rupee rate.
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ENV_FILE, ROOT } from "../config.ts";
import { DEFAULT_EDITIONS, START_RATES, type CostKind, type Edition } from "../editorial/copies.ts";
import { currentJob } from "../pipeline.ts";
import { profile, PUBLICATION as PUBLICATION_ID } from "../profile.ts";
import type { Store } from "../store.ts";
import { SisterStore } from "../sister.ts";
import { indiaNow, readJson, send, type Ctx } from "./http.ts";

/** A sister paper's name and language, for the newsroom. */
const pick = (e: Edition | undefined) => (e ? { name: e.name, lang: e.lang } : {});
import { copiesNow } from "./runs.ts";

export async function settingsRoutes(c: Ctx) {
  const { store, log, req, res, url, parts } = c;
  if (req.method === "GET" && url.pathname === "/api/status") {
    const { day, time } = indiaNow();
    const s = settingsOf(store);
    // the day the newsroom is on (?date=), today by default
    const asked = url.searchParams.get("date");
    const latest = store.latestIssue(asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : day);
    return send(res, 200, {
      today: day, now: time, ...s, nextRun: s.autoRun ? `${store.setting("lastScheduledRun", "") === day || time >= s.runAt ? "tomorrow" : "today"} ${s.runAt}` : null,
      running: currentJob(), lastJob: store.jobs(undefined, 1)[0] ?? null,
      openrouterKey: envHas("OPENROUTER_API_KEY"), aiOutOfMoney: store.setting("aiOutOfMoney", false),
      issue: latest ? { version: latest.version, status: latest.status, ready: (latest.report as { ready?: boolean }).ready,
                        issueNumber: (latest.report as { issueNumber?: number }).issueNumber } : null,
      version: gitVersion(),
      // (kickers: whether this paper prints them; the story editor hides the field when not)
      paper: { id: profile.id, name: profile.name, kickers: !(await import("../layout/typography.ts")).KICKER.none,
               // a sister paper worked on as its own (sister.ts): its name and language
               ...(store instanceof SisterStore ? { sister: store.id, ...pick(s.editions.find((e) => e.id === store.id)) } : {}) },
    });
  }
  if (parts[0] === "api" && parts[1] === "settings") {
    if (req.method === "GET") return send(res, 200, { ...settingsOf(store), openrouterKey: envHas("OPENROUTER_API_KEY"), telegram: await telegramOf(store) });
    if (req.method === "POST") {
      const body = (await readJson(req)) as { runAt?: string; autoRun?: boolean; openrouterKey?: string; lang?: string;
                                               onboarded?: boolean; inrPerUsd?: number; inrAuto?: boolean; notify?: boolean; newEngine?: boolean; siteUrl?: string;
                                               editions?: Edition[]; editionsAuto?: boolean;
                                               telegramToken?: string; telegramRemove?: number };
      if (body.editions !== undefined) {
        // only the names change: the papers themselves (their ids and languages) stay
        const now = settingsOf(store).editions;
        const named = now.map((e) => ({ ...e, name: (body.editions!.find((x) => x.id === e.id)?.name ?? e.name).trim().slice(0, 60) || e.name }));
        store.putSetting("editions", named);
      }
      if (body.editionsAuto !== undefined) store.putSetting("editionsAuto", !!body.editionsAuto);
      if (body.lang !== undefined) {
        if (body.lang !== "gu" && body.lang !== "en") return send(res, 400, { error: "the language is gu or en" });
        store.putSetting("lang", body.lang);
      }
      if (body.onboarded !== undefined) store.putSetting("onboarded", !!body.onboarded);
      if (body.siteUrl !== undefined) {
        if (body.siteUrl && !/^https:\/\/[^\s]+$/.test(body.siteUrl)) return send(res, 400, { error: "the website address starts with https://" });
        store.putSetting("siteUrl", body.siteUrl.trim());
      }
      if (body.notify !== undefined) store.putSetting("notify", !!body.notify);
      if (body.newEngine !== undefined) store.putSetting("newEngine", !!body.newEngine);
      if (body.inrPerUsd !== undefined) {
        if (!(body.inrPerUsd > 10 && body.inrPerUsd < 1000)) return send(res, 400, { error: "the rupee rate should be about 80-100" });
        store.putSetting("inrPerUsd", Math.round(body.inrPerUsd * 100) / 100);
        // a rate typed in by hand stays as typed
        if (body.inrAuto === undefined) store.putSetting("inrAuto", false);
      }
      if (body.inrAuto !== undefined) {
        store.putSetting("inrAuto", !!body.inrAuto);
        if (body.inrAuto) await rupeeRate(store, log, true);
      }
      if (body.runAt !== undefined) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.runAt)) return send(res, 400, { error: "the run time is HH:MM, e.g. 20:00" });
        store.putSetting("runAt", body.runAt);
      }
      if (body.autoRun !== undefined) store.putSetting("autoRun", !!body.autoRun);
      if (body.openrouterKey) {
        if (!/^sk-or-[A-Za-z0-9_-]{20,}$/.test(body.openrouterKey.trim())) return send(res, 400, { error: "that doesn't look like an OpenRouter key (sk-or-...)" });
        await setEnv("OPENROUTER_API_KEY", body.openrouterKey.trim());
      }
      if (body.telegramToken) {
        if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(body.telegramToken.trim())) return send(res, 400, { error: "that doesn't look like a Telegram bot token (from @BotFather)" });
        await setEnv("TELEGRAM_BOT_TOKEN", body.telegramToken.trim());
        store.putSetting("telegramOffset", 0);
      }
      if (body.telegramRemove !== undefined) {
        store.putSetting("telegramChats", store.setting<{ id: number }[]>("telegramChats", []).filter((c) => c.id !== body.telegramRemove));
      }
      return send(res, 200, { ...settingsOf(store), openrouterKey: envHas("OPENROUTER_API_KEY"), telegram: await telegramOf(store) });
    }
  }
  if (parts[0] === "api" && parts[1] === "telegram" && parts[2] === "photos") {
    // photos sent to the paper's bot that no article has yet, and the articles not printed yet (the newsroom attaches one)
    const { articles, attach } = await import("../ingest/telegram.ts");
    if (req.method === "POST") {
      const body = (await readJson(req)) as { photo: number; to: number };
      if (!(await attach(store, Number(body.photo), Number(body.to)))) return send(res, 400, { error: "that photo or article is gone" });
    }
    const all = store.inbox(true);
    return send(res, 200, {
      photos: all.filter((x) => x.kind === "photo" && x.pairedTo === undefined && x.at > Date.now() / 1000 - 2 * 86400).map((x) => ({ id: x.id, url: x.photo, at: x.at, from: x.from })),
      articles: articles(all).map((a) => ({ id: a.ids[0], at: a.at, title: a.text.split("\n").find((l) => l.trim())?.trim().slice(0, 80) ?? "" })),
    });
  }
  if (parts[0] === "api" && parts[1] === "space") {
    // what the data folder holds; POST clears old files now (tidy.ts)
    const t = await import("../tidy.ts");
    let freed: number | undefined;
    if (req.method === "POST") freed = await t.tidy(store, indiaNow().day, { busy: !!(currentJob() || copiesNow?.()), log });
    return send(res, 200, { ...(await t.space()), freed, tidied: store.setting("tidied", null) });
  }
  if (parts[0] === "api" && parts[1] === "backups") {
    const b = await import("../backup.ts");
    if (req.method === "POST") {
      const body = (await readJson(req)) as { folder?: string; now?: boolean; restore?: string };
      if (body.folder !== undefined) {
        const folder = body.folder.trim();
        if (folder && (!path.isAbsolute(folder) || !existsSync(folder))) return send(res, 400, { error: "that folder isn't there" });
        store.putSetting("backupFolder", folder);
        // the new place gets today's backup at once
        await b.backUp(store, indiaNow().day, { again: true, log }).catch(() => {});
      }
      if (body.now) await b.backUp(store, indiaNow().day, { again: true, log }).catch(() => {});
      if (body.restore !== undefined) {
        if (currentJob() || copiesNow?.()) return send(res, 409, { error: "the paper is being made; restore when it's done" });
        try { await b.askRestore(store, String(body.restore)); } catch (e) { return send(res, 400, { error: e instanceof Error ? e.message : String(e) }); }
        send(res, 202, { restarting: true });
        // the next engine (the app starts one again) puts the backup in place before it opens the database
        log(`restoring the backup of ${body.restore}: the engine stops`);
        setTimeout(() => process.exit(0), 300);
        return true;
      }
    }
    return send(res, 200, await b.backupState(store));
  }
}

/** The newsroom's settings, with their defaults. */
export function settingsOf(store: Store) {
  return {
    runAt: store.setting("runAt", "20:00"), autoRun: store.setting("autoRun", true),
    /** the newsroom's language: Gujarati or English */
    lang: store.setting<"gu" | "en">("lang", process.env.CK_LANG === "en" ? "en" : "gu"),
    /** the first-run welcome is done (a second paper of the same newsroom needs none) */
    onboarded: store.setting("onboarded", !!process.env.CK_PAPERS_HOME && PUBLICATION_ID !== "capital-kranti"),
    /** rupees to a US dollar, for showing the AI's cost (reported in USD) */
    inrPerUsd: store.setting("inrPerUsd", 88),
    /** what a story really costs in each kind of copy (US$), learned from batches (editorial/copies.ts), and a copy's minutes */
    costRates: { ...START_RATES, ...store.setting<Partial<Record<CostKind, number>>>("costRates", {}) },
    copyMinutes: store.setting("copyMinutes", 1),
    /** the sample ads printed on a day with nothing booked (the Ads screen) */
    samplesOn: store.setting("samplesOn", true),
    /** the rate kept up to date from the day's exchange rate (rupeeRate) */
    inrAuto: store.setting("inrAuto", true),
    /** when it was last brought up to date (ISO), "" never */
    inrUpdated: store.setting("inrUpdated", ""),
    notify: store.setting("notify", true),
    /** the paper's pages planned the new way (layout/planner.ts): on trial, off until it has proved itself */
    newEngine: store.setting("newEngine", false),
    /** the public website, for "Open the website" */
    siteUrl: store.setting("siteUrl", ""),
    /** the sister papers (editorial/copies.ts): their names and languages */
    editions: store.setting<Edition[]>("editions", DEFAULT_EDITIONS),
    /** make them by themselves once the evening paper is made */
    editionsAuto: store.setting("editionsAuto", true),
  };
}

// (backend/.env, or the app-data folder's settings.env: config.ts ENV_FILE)
/** Is a key set in backend/.env (its value is never sent anywhere)? */
export const envHas = (name: string) => !!process.env[name] || (existsSync(ENV_FILE) && readFileSync(ENV_FILE, "utf8").split("\n").some((l) => l.startsWith(`${name}=`) && l.length > name.length + 1));
/** Set one key in backend/.env, keeping the rest of the file. */
async function setEnv(name: string, value: string) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n").filter((l) => l && !l.startsWith(`${name}=`)) : [];
  lines.push(`${name}=${value.replace(/[\r\n]/g, "")}`);
  await writeFile(ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
}

/** The paper's Telegram bot, for Settings: its name (if the token works), the code a new person sends it, who's let in. */
async function telegramOf(store: Store) {
  if (!envHas("TELEGRAM_BOT_TOKEN")) return { token: false };
  const { botName, telegramState } = await import("../ingest/telegram.ts");
  const { code, chats } = telegramState(store);
  const bot = await botName();
  return { token: true, bot: bot === "busy" ? null : bot, busy: bot === "busy", code, chats, waiting: store.inbox(true).length };
}

/** The day's US dollar in rupees, from the European Central Bank's reference
 * rates (Frankfurter), else open.er-api.com -- once a day, while "keep it up
 * to date" is on. Nothing is sent but the request for the rate. */
export async function rupeeRate(store: Store, log: (s: string) => void, now = false) {
  const s = settingsOf(store);
  if (!s.inrAuto) return;
  if (!now && s.inrUpdated && Date.now() - Date.parse(s.inrUpdated) < 20 * 3600_000) return;
  const sources: [string, (j: { rates?: Record<string, number> }) => number | undefined][] = [
    ["https://api.frankfurter.app/latest?from=USD&to=INR", (j) => j.rates?.INR],
    ["https://open.er-api.com/v6/latest/USD", (j) => j.rates?.INR],
  ];
  for (const [url, pick] of sources) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) continue;
      const rate = pick(await r.json());
      if (!rate || !(rate > 10 && rate < 1000)) continue;
      store.putSetting("inrPerUsd", Math.round(rate * 100) / 100);
      store.putSetting("inrUpdated", new Date().toISOString());
      log(`rupee rate: US$1 = ₹${rate.toFixed(2)}`);
      return;
    } catch { /* offline: the last rate stays */ }
  }
}

let version: string | null = null;
/** The code's version, for the newsroom's About line: the app's (desktop/main.js), else its git commit. */
function gitVersion(): string {
  if (version === null && process.env.CK_APP_VERSION) version = process.env.CK_APP_VERSION;
  if (version === null) {
    try {
      version = readFileSync(path.join(ROOT, ".git", "HEAD"), "utf8").trim();
      const ref = version.match(/^ref: (.+)$/)?.[1];
      if (ref) version = `${ref.split("/").pop()} ${readFileSync(path.join(ROOT, ".git", ref), "utf8").trim().slice(0, 7)}`;
    } catch { version = "unknown"; }
  }
  return version;
}
