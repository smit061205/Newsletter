// The editor's phone: a private bot sends notes (a fact-checker's warning, a story taken down, a birthday). There are no
// approvals any more (the user, 30 Oct): news goes up by itself. Messages to the bot arrive either at the site
// (/api/telegram, when the bot's webhook points there) or are fetched by each engine run (getUpdates, when it doesn't);
// handleUpdate() answers one (/start) with the chat's number, the one TELEGRAM_CHAT_IDS needs.
import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;
const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHATS = () => (process.env.TELEGRAM_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const telegramOn = () => !!TOKEN() && CHATS().length > 0;
/** The bot answers /start as soon as it has its token, so a new editor can learn their chat number. */
const botOn = () => !!TOKEN();

async function api(method: string, body: Record<string, unknown>, ms = 20_000) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
  });
  return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; result?: unknown; description?: string };
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** A plain note to every editor. */
export async function tell(text: string) {
  if (!telegramOn()) return;
  for (const chat of CHATS()) await api("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true });
}

interface Update { update_id: number; message?: { chat: { id: number }; text?: string; from?: { first_name?: string } } }

/** A message to the bot: it says the chat's number and whether it's an editor's. */
export async function handleUpdate(sql: Sql, u: Update): Promise<string> {
  if (u.message) {
    const chat = String(u.message.chat.id);
    const editor = CHATS().includes(chat);
    await api("sendMessage", { chat_id: chat, parse_mode: "HTML", text: editor
      ? `નમસ્તે${u.message.from?.first_name ? ` ${esc(u.message.from.first_name)}` : ""}! આ ચેટ જોડાયેલી છે: સંપાદક માટેની સૂચનાઓ અહીં આવશે.`
      : `નમસ્તે! આ ચેટનો નંબર <code>${chat}</code> છે. સમાચાર અહીં મેળવવા, આ નંબર GitHub ના TELEGRAM_CHAT_IDS માં ઉમેરો.\n\nThis chat's number is <code>${chat}</code>. To get the stories here, add it to the TELEGRAM_CHAT_IDS secret on GitHub.` });
    return editor ? "hello editor" : "told the chat number";
  }
  return "not a message";
}

/** The messages since last time, when the bot has no webhook (each engine run,
 *  and engine/listen.ts between runs, which waits up to `wait` seconds for the next one).
 *  null when the site takes them as they come (a webhook). */
export async function pollUpdates(sql: Sql, wait = 0): Promise<number | null> {
  if (!botOn()) return 0;
  const info = await api("getWebhookInfo", {});
  if ((info.result as { url?: string })?.url) return null;
  const [st] = await sql.query(`select value from state where key = 'telegram_offset'`);
  const r = await api("getUpdates", { offset: st ? Number(st.value) : 0, timeout: wait, allowed_updates: ["message"] }, (wait + 20) * 1000);
  const updates = (r.result as Update[]) ?? [];
  for (const u of updates) await handleUpdate(sql, u);
  if (updates.length) {
    await sql.query(`insert into state (key, value) values ('telegram_offset', $1) on conflict (key) do update set value = excluded.value`,
      [String(updates.at(-1)!.update_id + 1)]);
  }
  return updates.length;
}
