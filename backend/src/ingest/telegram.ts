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
import { unmarked } from "../editorial/articles.ts";
import type { InboxItem, Release, Store } from "../store.ts";

/** Telegram's numbers are added to this for the releases' ids (apart from every other source's). */
const ID_BASE = 7_000_000_000;
/** A photo this near an article (seconds, either side) is its photo. */
const NEAR = 30 * 60;
/** Messages this near each other (seconds) from one person may be one article in parts: a long one
 * Telegram split (it cuts at 4,096 letters), or a headline sent on its own, then its text. */
const PARTS = 3 * 60;
/** A message this long may have been cut by Telegram: the next one is its rest, unless it
 * starts as news of its own (2 Nov: complete messages of 3,700 letters took the next news in) */
const SPLIT = 4000;
/** A photo is placed by its time, or asked about, once it has waited this long (seconds): its article may come after it. */
const SETTLE = NEAR;
/** A photo is looked at once he has sent nothing for this long (seconds): what he shared at once has all come. */
const QUIET = 2 * 60;
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
  missing: "આ ફોટાના સમાચાર હજી મળ્યા નથી. કૃપા કરીને સમાચારનું લખાણ અલગથી મોકલો; ફોટો તેની સાથે જોડાઈ જશે.",
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
  const line = unmarked(t).split("\n").map((l) => l.trim()).find(Boolean) ?? "";
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
  const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
  const [first, ...rest] = lines(text);
  if (/^\*[^*]+\*$/.test(first ?? "")) return false; // starts with its own headline in bold (WhatsApp's *...*)
  // Telegram cut it: the rest, unless a headline (short, no full stop) over its text
  if (before.length >= SPLIT) return !(rest.length && first.length <= 160 && !/[.।!?]\s*$/.test(first));
  // a headline, then its text (not a one-line news item of its own, which ends
  // in a full stop: 26 Oct joined the next article to one)
  if (lines(before).length === 1 && before.length <= 150 && !/[.।!?]\s*$/.test(before.trim())) return true;
  if (rest.length && first.length <= 160) return false; // a headline of its own over its text
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
  const base = { id: u.update_id, chat: m.chat.id, from: name, at: m.date, msg: m.message_id };
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
  const photos = batchOf(store, Number(photoId));
  if (!photos.length || photos[0].usedOn) return;
  if (what === "c") return ask(store, photos, log);
  const pick = Number(to);
  for (const p of photos) store.putInbox({ ...p, pairedTo: pick, asked: undefined });
  const art = articles(store.inbox()).find((a) => a.ids.includes(pick));
  await api("editMessageText", { chat_id: q.message!.chat.id, message_id: q.message!.message_id,
                                 text: art ? SAY.joined(titleOf(art.text)) : SAY.noneDone,
                                 ...(art ? { reply_markup: { inline_keyboard: [[{ text: SAY.change, callback_data: `c:${photoId}` }]] } } : {}) }).catch(() => {});
}

/** The newsroom attaches a waiting photo to an article (0: to none). False if either is gone.
 * (the photo alone: an album may hold photos of several articles) */
export async function attach(store: Store, photo: number, to: number): Promise<boolean> {
  const p = store.inbox().find((x) => x.id === photo && x.kind === "photo");
  const art = articles(store.inbox(true)).find((a) => a.ids.includes(to));
  if (!p || p.usedOn || (to !== 0 && !art)) return false;
  store.putInbox({ ...p, pairedTo: to, asked: undefined });
  if (art) await api("sendMessage", { chat_id: p.chat, text: SAY.joined(titleOf(art.text)), ...onPhoto(p) }).catch(() => {});
  return true;
}

/** A message about a photo sent as a reply to it, so he sees which photo it means (2 Nov). */
const onPhoto = (p: InboxItem) => (p.msg ? { reply_parameters: { message_id: p.msg, allow_sending_without_reply: true } } : {});

/** A photo and those of its album the bot spoke of with it: joined to the same article, or
 * asked about in the same question. (Not the whole album: shared from WhatsApp, the photos of
 * several articles come as one album, 10 to an album -- 22 Nov's ten went with one article.) */
const batchOf = (store: Store, id: number) => {
  const all = store.inbox();
  const p = all.find((x) => x.id === id && x.kind === "photo");
  if (!p) return [];
  if (!p.album) return [p];
  return all.filter((x) => x.kind === "photo" && x.album === p.album &&
    (p.pairedTo !== undefined ? x.pairedTo === p.pairedTo : x.pairedTo === undefined && x.asked === p.asked));
};

/** The bot asks which article a photo (album) goes with: his recent ones as buttons. */
async function ask(store: Store, photos: InboxItem[], _log: (s: string) => void) {
  const p = photos[0];
  const all = store.inbox();
  const recent = articles(all).filter((a) => a.chat === p.chat && Math.abs(a.at - p.at) <= RECENT && !all.find((x) => x.id === a.ids[0])?.usedOn)
    .slice(-6).reverse();
  if (!recent.length) {
    for (const x of photos) store.putInbox({ ...x, asked: -1 });
    await api("sendMessage", { chat_id: p.chat, text: SAY.noArticle, ...onPhoto(p) });
    return;
  }
  const sent = await api<{ message_id: number }>("sendMessage", {
    chat_id: p.chat, text: SAY.which, ...onPhoto(p),
    reply_markup: { inline_keyboard: [...recent.map((a) => [{ text: titleOf(a.text), callback_data: `p:${p.id}:${a.ids[0]}` }]),
                                      [{ text: SAY.none, callback_data: `p:${p.id}:0` }]] },
  });
  for (const x of photos) store.putInbox({ ...x, asked: sent.message_id });
}

type Article = ReturnType<typeof articles>[number];

/** Photos he has finished sending: each looked at by the AI on its own (an album may hold
 * the photos of several articles), joined to the article it surely shows; one whose article
 * surely hasn't come, he's told at once (shared from WhatsApp, a photo goes and the article
 * written under it doesn't: 22 Nov); the rest, once settled, placed by time or asked about. */
export async function placePhotos(store: Store, log: (s: string) => void, now = Date.now() / 1000) {
  const final = now === Number.POSITIVE_INFINITY;
  const all = store.inbox();
  const arts = articles(all);
  // (a photo told it had no article to go with looks again once articles have come: 1 Nov)
  const hasArticle = (x: InboxItem) => arts.some((a) => a.chat === x.chat && Math.abs(a.at - x.at) <= RECENT && !all.find((y) => y.id === a.ids[0])?.usedOn);
  // (he's still sending: a photo's article may be on its way)
  const quiet = (chat: number) => final || !all.some((x) => x.chat === chat && now - x.at < QUIET);
  const jobs = all.filter((x) => x.kind === "photo" && x.pairedTo === undefined && (!x.asked || (x.asked === -1 && hasArticle(x))) && !x.usedOn && quiet(x.chat));
  const joined: { p: InboxItem; to: Article }[] = [];
  // several looked at together (26 Oct: 17 forwarded at once took two minutes one by one)
  const next = async (): Promise<void> => {
    const p = jobs.shift();
    if (!p) return;
    // (one photo that can't be placed now -- the internet gone -- doesn't hold up the others: it's tried again next time)
    try {
      const to = await placeOne(store, p, arts, all, log, now);
      if (to) joined.push({ p, to });
    } catch (e) { log(`Telegram: a photo not placed yet (${e instanceof Error ? e.message : e})`); }
    return next();
  };
  await Promise.all(Array.from({ length: 6 }, next));
  // one word to him for the photos of an album joined to one article (its "change" changes them all)
  const said = new Set<string>();
  for (const { p, to } of joined.sort((a, b) => a.p.id - b.p.id)) {
    const key = `${p.album ?? p.id}|${to.ids[0]}`;
    if (said.has(key)) continue;
    said.add(key);
    await api("sendMessage", { chat_id: p.chat, text: SAY.joined(titleOf(to.text)), ...onPhoto(p),
                               reply_markup: { inline_keyboard: [[{ text: SAY.change, callback_data: `c:${p.id}` }]] } }).catch(() => {});
  }
}

/** One photo: the article it's joined to (he's told by the caller), or null (left waiting, or asked about). */
async function placeOne(store: Store, p: InboxItem, arts: Article[], all: InboxItem[], log: (s: string) => void, now: number): Promise<Article | null> {
  const final = now === Number.POSITIVE_INFINITY;
  const settled = final || now - p.at >= SETTLE;
  const mine = arts.filter((a) => a.chat === p.chat && !all.find((x) => x.id === a.ids[0])?.usedOn);
  const near = mine.filter((a) => Math.abs(a.at - p.at) <= NEAR);
  const recent = mine.filter((a) => Math.abs(a.at - p.at) <= RECENT);
  if (!recent.length) {
    if (settled) await ask(store, [p], log);
    return null;
  }
  const ids = recent.map((a) => a.ids[0]);
  const covers = (xs?: number[]) => !!xs && ids.every((i) => xs.includes(i));
  // (the AI has looked at it against these already: none was it, it waits for his next
  // article; or it wasn't sure, it waits to settle)
  if (!final && covers(p.notOf)) return null;
  if (!settled && covers(p.unsure)) return null;
  // the AI looks (when there's one): the time can mislead -- a photo sent
  // between two articles, or before its own (26 Oct)
  const seen = covers(p.notOf) ? "none" : covers(p.unsure) ? null : await byLooking(p, recent, log);
  if (seen === "none") {
    // (at paper time: asked, unless he was told its news hadn't come -- then it waits for that news)
    if (final) { if (!p.told) await ask(store, [p], log); return null; }
    // surely none of his articles so far: he's told once, and it waits for his next one
    store.putInbox({ ...p, notOf: ids, told: true });
    if (!p.told) await api("sendMessage", { chat_id: p.chat, text: SAY.missing, ...onPhoto(p) }).catch(() => {});
    return null;
  }
  const byTime = near.length === 1 ? near[0] : null;
  if (seen && byTime && seen !== byTime) {
    log(`Telegram: a photo's time and what's in it point to different articles: he's asked`);
    await ask(store, [p], log);
    return null;
  }
  const pick = seen ?? (settled ? byTime : null);
  if (pick) {
    store.putInbox({ ...p, pairedTo: pick.ids[0], unsure: undefined });
    return pick;
  }
  if (!settled) { store.putInbox({ ...p, unsure: ids }); return null; }
  await ask(store, [p], log);
  return null;
}

/** The AI looks at a photo and his recent articles: the one it's surely of, or none. */
async function byLooking(p: InboxItem, recent: Article[], log: (s: string) => void) {
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
        { type: "text", text: `A newspaper reporter sent this photo${p.text ? ` with the note "${p.text}"` : ""}. ` +
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
  await caughtUp(log);
  // (photos that haven't settled yet: placed now if time or the AI can; any other waits for his answer)
  await placePhotos(store, log, Number.POSITIVE_INFINITY).catch((e: unknown) => log(`Telegram: photos not placed (${e instanceof Error ? e.message : e})`));
  const all = store.inbox(true);
  let n = 0;
  for (const a of articles(all)) {
    const photos = all.filter((x) => x.kind === "photo" && x.pairedTo !== undefined && a.ids.includes(x.pairedTo)).map((x) => x.photo!);
    const lines = unmarked(a.text).split("\n").map((l) => l.trim()).filter(Boolean);
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

let known: { token: string; name: string } | null = null;
/** The bot's name if the token works, null if Telegram turns the token down,
 * "busy" if Telegram couldn't be asked just now (too many asks, no internet):
 * a new bot's first minutes answered "too many requests" and Settings called
 * the key wrong. */
export async function botName(): Promise<string | null | "busy"> {
  const t = token();
  if (!t) return null;
  if (known?.token === t) return known.name;
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/getMe`, { method: "POST", signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 404) return null;
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { username: string } };
    if (!data.ok || !data.result) return "busy";
    known = { token: t, name: data.result.username };
    return known.name;
  } catch {
    return "busy";
  }
}

let polling = false;
/** When the ask now waiting on Telegram began (0: none is: messages are being taken in). */
let askingSince = 0;
/** Telegram didn't answer the last ask. */
let unreachable = false;
/** An ask with messages waiting returns at once: one still open after this long (ms) means none are. */
const NONE_WAITING = 3000;
/** The longest the paper waits for messages still coming in (ms). */
const CATCH_UP = 5 * 60_000;

/** Waits for what Telegram is holding to come in. Messages sent while the app was closed
 * come when it opens, one by one, photos before the words sent after them: on 1 Nov the
 * paper looked halfway through, saw only photos and took no news. */
async function caughtUp(log: (s: string) => void) {
  const began = Date.now();
  let said = false;
  while (polling && !unreachable && Date.now() - began < CATCH_UP) {
    // (an ask open for 3 seconds since the paper began: a message sent a second before is in)
    if (askingSince && Date.now() - Math.max(askingSince, began) >= NONE_WAITING) return;
    if (!said && Date.now() - began > NONE_WAITING * 2) { said = true; log("Telegram: messages are still coming in: waiting for them"); }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (Date.now() - began >= CATCH_UP) log("Telegram: still more messages coming in: the paper goes on with those that have come");
}

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
        askingSince = Date.now();
        const updates = await api<TgUpdate[]>("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "callback_query"] }, 70);
        askingSince = 0;
        unreachable = false;
        for (const u of updates) {
          await take(store, u, log).catch((e: unknown) => log(`Telegram: a message couldn't be taken (${e instanceof Error ? e.message : e})`));
          store.putSetting("telegramOffset", u.update_id + 1);
        }
        // (not with messages still to come: a photo would be told it has no article)
        if (!updates.length && Date.now() - lastPlace > 60_000) {
          lastPlace = Date.now();
          await placePhotos(store, log);
        }
      } catch (e) {
        askingSince = 0;
        unreachable = true;
        log(`Telegram: ${e instanceof Error ? e.message : e} (trying again in a minute)`);
        await new Promise((r) => setTimeout(r, 60_000));
      }
    }
  };
  void loop();
}
