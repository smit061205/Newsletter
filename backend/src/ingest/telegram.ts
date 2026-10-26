// News sent to the paper's own Telegram bot: the editor (or anyone he lets
// in) sends what he has through the day -- a typed or forwarded article, a
// photo, a link -- whenever he has it; the paper takes it in.
//
//   - the engine asks Telegram for new messages all the time it runs (a long
//     wait for each answer: no traffic when there's nothing), and keeps each
//     in its own inbox at once (Telegram itself keeps them only a day);
//   - only the people the editor let in count: each sends the bot the code
//     the newsroom's Settings shows, once; anyone else is ignored;
//   - every message is answered in Gujarati, so he knows it arrived;
//   - a photo finds its article: sent within half an hour of one, it's that
//     one's (the AI looking too when he sent others: if it's sure of another,
//     he's asked); else the AI looks at it (writing on banners, boards) and
//     matches it if it's sure; else the bot asks him, his recent articles as buttons.
//     Nothing is guessed: a photo nobody placed stays out of the paper;
//   - at paper time (pipeline.ts fetch) what no paper has taken yet becomes
//     the day's releases, written up like any other (editorial/rewrite.ts),
//     every number checked against what he sent. What comes after the paper
//     is made goes into the next one.
// A link alone can't be read (Facebook and the like turn programs away, and
// the paper doesn't get round that): the bot asks for the text instead.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import { env, openRouter } from "../editorial/rewrite.ts";
import { profile } from "../profile.ts";
import type { InboxItem, Release, Store } from "../store.ts";

/** Telegram's numbers are added to this for the releases' ids (apart from every other source's). */
const ID_BASE = 7_000_000_000;
/** A photo this near an article (seconds, either side) is its photo. */
const NEAR = 30 * 60;
/** Messages this near each other (seconds) from one person may be one article in parts: a long one
 * Telegram split (it cuts at 4,096 letters), or a headline sent on its own, then its text. */
const PARTS = 3 * 60;
/** A message this long was cut by Telegram: the next one is its rest. */
const SPLIT = 3500;
/** A photo is placed once it has waited this long (seconds): its article may come after it. */
const SETTLE = NEAR;
/** Articles a photo may go with: the last day's. */
const RECENT = 24 * 3600;
/** The office the paper credits his news to. */
const OFFICE = "અમારા પ્રતિનિધિ દ્વારા";

const SAY = {
  got: "મળ્યું ✓ આગામી છાપામાં જશે.",
  photoGot: "ફોટો મળ્યો ✓",
  link: "આ લિંક ખોલી શકાતી નથી. કૃપા કરીને સમાચારનું લખાણ મોકલો.",
  which: "આ ફોટો કયા સમાચાર સાથે છે?",
  none: "કોઈ નહીં",
  noneDone: "આ ફોટો છાપામાં નહીં જાય.",
  change: "બદલો",
  joined: (h: string) => `ફોટો “${h}” સાથે જોડ્યો ✓`,
  welcome: "નમસ્તે! હવે તમે અહીં સમાચાર અને ફોટા મોકલી શકો છો. દરેક સમાચાર આગામી છાપામાં જશે.",
  noArticle: "આ ફોટો માટે કોઈ સમાચાર મળ્યા નહીં. સમાચાર મોકલશો તો ફોટો તેની સાથે જોડાશે.",
};

const token = () => env("TELEGRAM_BOT_TOKEN");
const api = async <T>(method: string, body: Record<string, unknown> = {}, seconds = 30): Promise<T> => {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(seconds * 1000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  return data.result as T;
};

/** The first line of an article (its headline as he wrote it), short. */
const titleOf = (t: string) => {
  const line = t.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
};
/** A message that is only a link (or links): nothing to print. */
const onlyLink = (t: string) => /https?:\/\/\S+/.test(t) && t.replace(/https?:\/\/\S+/g, "").replace(/[\s.,:;!?-]/g, "").length < 20;

/** The people let in (their Telegram chats), and the code a new one sends. */
export function telegramState(store: Store) {
  let code = store.setting<string>("telegramCode", "");
  if (!code) {
    code = String(100000 + Math.floor(Math.random() * 900000));
    store.putSetting("telegramCode", code);
  }
  return { chats: store.setting<{ id: number; name: string }[]>("telegramChats", []), code };
}

/** The articles of the inbox: messages from one person close together, as one. Each: its items, its text, when. */
export function articles(items: InboxItem[]): { ids: number[]; chat: number; at: number; text: string }[] {
  const out: { ids: number[]; chat: number; at: number; last: number; text: string }[] = [];
  for (const it of items.filter((x) => x.kind === "text")) {
    const prev = out.findLast((a) => a.chat === it.chat);
    // (only a message found to be the one before's rest, when it came: continuing())
    if (prev && it.cont && it.at - prev.last <= PARTS && !prev.ids.some((id) => items.find((x) => x.id === id)?.usedOn !== it.usedOn)) {
      prev.ids.push(it.id);
      prev.text += `\n\n${it.text}`;
      prev.last = it.at;
    } else out.push({ ids: [it.id], chat: it.chat, at: it.at, last: it.at, text: it.text });
  }
  return out.map(({ last: _, ...a }) => a);
}

/** Is `text` (just in) the rest of `before` (his message before it, a moment ago), or news of its own?
 * By their shape where that's plain; else the AI reads both (none: its own). */
async function continuing(before: string, text: string, log: (s: string) => void): Promise<boolean> {
  if (before.length >= SPLIT) return true; // Telegram cut it
  const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines(before).length === 1 && before.length <= 150) return true; // a headline, then its text
  const [first, ...rest] = lines(text);
  if (rest.length && first.length <= 120) return false; // a headline of its own over its text
  const key = env("OPENROUTER_API_KEY");
  if (!key) return false;
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model: env("OPENROUTER_MODEL") ?? profile.editorial.workhorseModel, temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: "rest", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["rest"],
        properties: { rest: { type: "boolean", description: "true if the second message continues the same news as the first" } } } } },
      messages: [{ role: "user", content: `A reporter sent two messages a moment apart. Is the second the rest of the same news item as the first, or a different news item?\n\nFIRST:\n${before.slice(-1500)}\n\nSECOND:\n${text.slice(0, 1500)}` }],
    }),
  }, 30);
  if (!res.ok) { log(`Telegram: couldn't tell if a message continues the one before (OpenRouter ${res.status}): kept apart`); return false; }
  try {
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return !!JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")).rest;
  } catch { return false; }
}

/** One message in: kept, answered. */
async function take(store: Store, u: TgUpdate, log: (s: string) => void) {
  const { chats, code } = telegramState(store);
  if (u.callback_query) return answer(store, u.callback_query, log);
  const m = u.message;
  if (!m) return;
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || "—";
  if (!chats.some((c) => c.id === m.chat.id)) {
    // the code from the newsroom's Settings lets a new person in; anyone else is ignored
    if ((m.text ?? "").trim() === code) {
      store.putSetting("telegramChats", [...chats, { id: m.chat.id, name }]);
      store.putSetting("telegramCode", "");
      log(`Telegram: ${name} can now send news`);
      await api("sendMessage", { chat_id: m.chat.id, text: SAY.welcome });
    }
    return;
  }
  const text = (m.text ?? m.caption ?? "").trim();
  if (m.text?.startsWith("/start")) return void await api("sendMessage", { chat_id: m.chat.id, text: SAY.welcome });
  const base = { id: u.update_id, chat: m.chat.id, from: name, at: m.date };
  if (m.photo?.length) {
    // the largest size Telegram has of it
    const file = await api<{ file_path: string }>("getFile", { file_id: m.photo[m.photo.length - 1].file_id });
    const res = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Telegram photo: ${res.status}`);
    const dir = path.join(MEDIA_DIR, "telegram");
    await mkdir(dir, { recursive: true });
    const name = `${u.update_id}${path.extname(file.file_path) || ".jpg"}`;
    await writeFile(path.join(dir, name), new Uint8Array(await res.arrayBuffer()));
    // a photo with a long caption is an article with its own photo
    if (text.length >= 80) {
      store.putInbox({ ...base, kind: "text", text });
      store.putInbox({ ...base, id: -u.update_id, kind: "photo", text: "", photo: `/media/telegram/${name}`, pairedTo: u.update_id });
      await api("sendMessage", { chat_id: m.chat.id, text: SAY.got, reply_to_message_id: m.message_id });
      return;
    }
    store.putInbox({ ...base, kind: "photo", text, photo: `/media/telegram/${name}`, ...(m.media_group_id ? { album: m.media_group_id } : {}) });
    // (an album answers once)
    if (!m.media_group_id || !store.inbox().some((x) => x.album === m.media_group_id && x.id !== u.update_id)) {
      await api("sendMessage", { chat_id: m.chat.id, text: SAY.photoGot, reply_to_message_id: m.message_id });
    }
    return;
  }
  if (!text) return;
  if (onlyLink(text)) return void await api("sendMessage", { chat_id: m.chat.id, text: SAY.link, reply_to_message_id: m.message_id });
  // his message just before, a moment ago: this may be its rest
  const before = store.inbox(true).findLast((x) => x.kind === "text" && x.chat === m.chat.id);
  const cont = !!before && m.date - before.at <= PARTS && await continuing(before.text, text, log);
  store.putInbox({ ...base, kind: "text", text, ...(cont ? { cont } : {}) });
  await api("sendMessage", { chat_id: m.chat.id, text: SAY.got, reply_to_message_id: m.message_id });
}

/** His answer to "which article?" (or "change"). */
async function answer(store: Store, q: NonNullable<TgUpdate["callback_query"]>, log: (s: string) => void) {
  await api("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {});
  if (!telegramState(store).chats.some((c) => c.id === q.message?.chat.id)) return;
  const [what, photoId, to] = (q.data ?? "").split(":");
  const photos = albumOf(store, Number(photoId));
  if (!photos.length || photos[0].usedOn) return;
  if (what === "c") return ask(store, photos, log);
  const pick = Number(to);
  for (const p of photos) store.putInbox({ ...p, pairedTo: pick, asked: undefined });
  const art = articles(store.inbox()).find((a) => a.ids.includes(pick));
  await api("editMessageText", { chat_id: q.message!.chat.id, message_id: q.message!.message_id,
                                 text: art ? SAY.joined(titleOf(art.text)) : SAY.noneDone,
                                 ...(art ? { reply_markup: { inline_keyboard: [[{ text: SAY.change, callback_data: `c:${photoId}` }]] } } : {}) }).catch(() => {});
}

/** The newsroom attaches a waiting photo (and its album) to an article (0: to none). False if either is gone. */
export async function attach(store: Store, photo: number, to: number): Promise<boolean> {
  const photos = albumOf(store, photo);
  const art = articles(store.inbox(true)).find((a) => a.ids.includes(to));
  if (!photos.length || photos[0].usedOn || (to !== 0 && !art)) return false;
  for (const p of photos) store.putInbox({ ...p, pairedTo: to, asked: undefined });
  if (art) await api("sendMessage", { chat_id: photos[0].chat, text: SAY.joined(titleOf(art.text)) }).catch(() => {});
  return true;
}

/** A photo and the others of its album. */
const albumOf = (store: Store, id: number) => {
  const all = store.inbox();
  const p = all.find((x) => x.id === id && x.kind === "photo");
  return !p ? [] : p.album ? all.filter((x) => x.album === p.album) : [p];
};

/** The bot asks which article a photo (album) goes with: his recent ones as buttons. */
async function ask(store: Store, photos: InboxItem[], _log: (s: string) => void) {
  const p = photos[0];
  const all = store.inbox();
  const recent = articles(all).filter((a) => a.chat === p.chat && Math.abs(a.at - p.at) <= RECENT && !all.find((x) => x.id === a.ids[0])?.usedOn)
    .slice(-6).reverse();
  if (!recent.length) {
    for (const x of photos) store.putInbox({ ...x, asked: -1 });
    await api("sendMessage", { chat_id: p.chat, text: SAY.noArticle });
    return;
  }
  const sent = await api<{ message_id: number }>("sendMessage", {
    chat_id: p.chat, text: SAY.which,
    reply_markup: { inline_keyboard: [...recent.map((a) => [{ text: titleOf(a.text), callback_data: `p:${p.id}:${a.ids[0]}` }]),
                                      [{ text: SAY.none, callback_data: `p:${p.id}:0` }]] },
  });
  for (const x of photos) store.putInbox({ ...x, asked: sent.message_id });
}

/** Photos that have waited long enough: placed by time, else by the AI, else asked about. */
export async function placePhotos(store: Store, log: (s: string) => void, now = Date.now() / 1000) {
  const all = store.inbox();
  const arts = articles(all);
  const waiting = all.filter((x) => x.kind === "photo" && x.pairedTo === undefined && !x.asked && !x.usedOn && now - x.at >= SETTLE);
  const done = new Set<string>();
  for (const p of waiting) {
    const group = p.album ? all.filter((x) => x.album === p.album) : [p];
    const key = p.album ?? String(p.id);
    if (done.has(key)) continue;
    done.add(key);
    // (one photo that can't be placed now -- the internet gone -- doesn't hold up the others: it's tried again next time)
    try { await placeOne(store, p, group, arts, all, log, now === Number.POSITIVE_INFINITY); } catch (e) { log(`Telegram: a photo not placed yet (${e instanceof Error ? e.message : e})`); }
  }
}

async function placeOne(store: Store, p: InboxItem, group: InboxItem[], arts: ReturnType<typeof articles>, all: InboxItem[], log: (s: string) => void,
                        final: boolean) {
  const mine = arts.filter((a) => a.chat === p.chat && !all.find((x) => x.id === a.ids[0])?.usedOn);
  const near = mine.filter((a) => Math.abs(a.at - p.at) <= NEAR);
  const recent = mine.filter((a) => Math.abs(a.at - p.at) <= RECENT);
  // (the AI has already looked at it against these, and none was it: it waits for his next article)
  if (!final && recent.length && p.notOf && recent.every((a) => p.notOf!.includes(a.ids[0]))) return;
  let pick: (typeof recent)[number] | null = near.length === 1 ? near[0] : null;
  // the AI looks too (when there's one): the time can mislead -- a photo sent
  // between two articles, or before its own (26 Oct)
  const seen = recent.length ? await byLooking(p, group, recent, log) : null;
  if (seen === "none") {
    // surely none of his articles so far: its own may be on the way -- it waits for
    // his next one (and at paper time, he's asked)
    if (!final) { for (const x of group) store.putInbox({ ...x, notOf: recent.map((a) => a.ids[0]) }); return; }
    return ask(store, group, log);
  }
  if (seen && pick && seen !== pick) {
    log(`Telegram: a photo's time and what's in it point to different articles: he's asked`);
    return ask(store, group, log);
  }
  pick = seen ?? pick;
  if (pick) {
    for (const x of group) store.putInbox({ ...x, pairedTo: pick.ids[0] });
    await api("sendMessage", { chat_id: p.chat, text: SAY.joined(titleOf(pick.text)),
                               reply_markup: { inline_keyboard: [[{ text: SAY.change, callback_data: `c:${p.id}` }]] } }).catch(() => {});
  } else await ask(store, group, log);
}

/** The AI looks at a photo and his recent articles: the one it's surely of, or none. */
async function byLooking(p: InboxItem, group: InboxItem[], recent: ReturnType<typeof articles>, log: (s: string) => void) {
  const key = env("OPENROUTER_API_KEY");
  if (!key) return null;
  const model = env("OPENROUTER_VISION_MODEL") ?? profile.editorial.leadModel;
  const img = await readFile(path.join(MEDIA_DIR, p.photo!.slice("/media/".length))).catch(() => null);
  if (!img) return null;
  const list = recent.map((a, i) => `${i + 1}. ${a.text.slice(0, 400).replace(/\s+/g, " ")}`).join("\n");
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0, usage: { include: true },
      response_format: { type: "json_schema", json_schema: { name: "match", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["article", "sure"],
        properties: { article: { type: "integer", description: "the number of the article the photo shows, 0 if none of them" },
                      sure: { type: "boolean", description: "true only if you are certain: the photo clearly belongs to that article (writing on a banner, the place, the people named), or, with 0, clearly to none of them" } },
      } } },
      messages: [{ role: "user", content: [
        { type: "text", text: `A newspaper reporter sent this photo${group.length > 1 ? ` (one of ${group.length})` : ""}${p.text ? ` with the note "${p.text}"` : ""}. ` +
          `Which of these articles is it for? Read any writing in the photo.\n\n${list}` },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${img.toString("base64")}` } },
      ] }],
    }),
  });
  if (!res.ok) { log(`Telegram: the photo couldn't be looked at (OpenRouter ${res.status})`); return null; }
  try {
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const out = JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as { article: number; sure: boolean };
    if (!out.sure) return null;
    return out.article >= 1 && out.article <= recent.length ? recent[out.article - 1] : "none";
  } catch { return null; }
}

/** At paper time: what no paper has taken yet, as the day's releases (photos still
 * waiting are placed first: by time, by the AI, or asked about -- an answer that
 * comes too late leaves the photo out). */
export async function ingestTelegram(store: Store, date: string, opts: { log?: (s: string) => void } = {}): Promise<number> {
  const log = opts.log ?? (() => {});
  if (!token()) return 0;
  // (photos that haven't settled yet: placed now if time or the AI can; any other waits for his answer)
  await placePhotos(store, log, Number.POSITIVE_INFINITY).catch((e: unknown) => log(`Telegram: photos not placed (${e instanceof Error ? e.message : e})`));
  const all = store.inbox(true);
  let n = 0;
  for (const a of articles(all)) {
    const photos = all.filter((x) => x.kind === "photo" && x.pairedTo !== undefined && a.ids.includes(x.pairedTo)).map((x) => x.photo!);
    const lines = a.text.split("\n").map((l) => l.trim()).filter(Boolean);
    const release: Release = {
      id: ID_BASE + a.ids[0], date, url: `telegram:${a.ids[0]}`, office: OFFICE,
      // (his first line as the headline when it's short; the AI writes the paper's own)
      headline: lines[0].length <= 140 && lines.length > 1 ? lines[0] : titleOf(a.text),
      subhead: "", body: lines.length > 1 && lines[0].length <= 140 ? lines.slice(1).join("\n\n") : lines.join("\n\n"),
      photos, fetchedAt: new Date().toISOString(), source: "telegram", lang: "gu",
    };
    store.putRelease(release);
    for (const id of a.ids) { const it = all.find((x) => x.id === id)!; store.putInbox({ ...it, usedOn: date }); }
    for (const x of all.filter((x) => x.kind === "photo" && x.pairedTo !== undefined && a.ids.includes(x.pairedTo))) store.putInbox({ ...x, usedOn: date });
    n++;
  }
  if (n) log(`Telegram: ${n} item(s) sent to the paper`);
  return n;
}

interface TgUpdate {
  update_id: number;
  message?: { message_id: number; date: number; chat: { id: number }; from?: { first_name?: string; last_name?: string };
              text?: string; caption?: string; photo?: { file_id: string }[]; media_group_id?: string };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
}

/** The bot's name, if the token works. */
export async function botName(): Promise<string | null> {
  if (!token()) return null;
  return api<{ username: string }>("getMe").then((r) => r.username, () => null);
}

let polling = false;
/** Asks Telegram for messages for as long as the engine runs (a token set). */
export function pollTelegram(store: Store, log: (s: string) => void) {
  if (polling) return;
  polling = true;
  let lastPlace = 0;
  const loop = async () => {
    for (;;) {
      if (!token()) { await new Promise((r) => setTimeout(r, 60_000)); continue; }
      try {
        const offset = store.setting<number>("telegramOffset", 0);
        const updates = await api<TgUpdate[]>("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "callback_query"] }, 70);
        for (const u of updates) {
          await take(store, u, log).catch((e: unknown) => log(`Telegram: a message couldn't be taken (${e instanceof Error ? e.message : e})`));
          store.putSetting("telegramOffset", u.update_id + 1);
        }
        if (Date.now() - lastPlace > 60_000) {
          lastPlace = Date.now();
          await placePhotos(store, log);
        }
      } catch (e) {
        log(`Telegram: ${e instanceof Error ? e.message : e} (trying again in a minute)`);
        await new Promise((r) => setTimeout(r, 60_000));
      }
    }
  };
  void loop();
}
