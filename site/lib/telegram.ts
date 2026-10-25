// The editor's phone (decided 25 Oct: Telegram now, a sign-in page later): a
// private bot sends each story the engine holds (sensitive, or a check it
// didn't pass) with Approve / Reject buttons, and says when a fact-checker has
// flagged something. Only the chats named in TELEGRAM_CHAT_IDS may decide.
//
// The buttons' answers arrive either at the site (/api/telegram, instantly,
// when the bot's webhook points there) or are fetched by each engine run
// (getUpdates, when it doesn't). Both go through handleUpdate().
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { touched } from "./write.ts";

type Sql = NeonQueryFunction<false, false>;
const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHATS = () => (process.env.TELEGRAM_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const telegramOn = () => !!TOKEN() && CHATS().length > 0;

async function api(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; result?: unknown; description?: string };
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** A plain note to every editor. */
export async function tell(text: string) {
  if (!telegramOn()) return;
  for (const chat of CHATS()) await api("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true });
}

export interface HeldStory { id: string; headline: string; deck: string; body: string; reason: string; sources: { name: string; url: string }[] }

/** A held story to every editor, with the buttons. */
export async function askApproval(sql: Sql, s: HeldStory) {
  if (!telegramOn()) return;
  const text = `<b>મંજૂરી જોઈએ</b> (${esc(s.reason)})\n\n<b>${esc(s.headline)}</b>\n${esc(s.deck)}\n\n${esc(s.body.slice(0, 2200))}${s.body.length > 2200 ? "…" : ""}\n\n` +
    `સ્રોત: ${s.sources.map((x) => `<a href="${esc(x.url)}">${esc(x.name)}</a>`).join(", ")}`;
  let first: number | null = null;
  for (const chat of CHATS()) {
    const r = await api("sendMessage", {
      chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: "✅ પ્રકાશિત કરો", callback_data: `a:${s.id}` }, { text: "❌ નહીં", callback_data: `r:${s.id}` }]] },
    });
    first ??= ((r.result as { message_id?: number })?.message_id) ?? null;
  }
  await sql.query(`insert into approvals (story_id, message_id) values ($1, $2) on conflict (story_id) do nothing`, [s.id, first]);
}

interface Update { update_id: number; callback_query?: { id: string; data?: string; from: { id: number; first_name?: string }; message?: { chat: { id: number }; message_id: number; text?: string } } }

/** One button press: only from an editor's chat; a story is decided once. */
export async function handleUpdate(sql: Sql, u: Update): Promise<string> {
  const q = u.callback_query;
  if (!q?.data || !q.message) return "not a button";
  const chat = String(q.message.chat.id);
  if (!CHATS().includes(chat)) { await api("answerCallbackQuery", { callback_query_id: q.id, text: "Not allowed" }); return "not an editor"; }
  const m = q.data.match(/^([ar]):(.+)$/);
  if (!m) return "unknown button";
  const [, what, id] = m;
  const [row] = await sql.query(`select status from stories where id = $1`, [id]);
  if (!row || row.status !== "held") {
    await api("answerCallbackQuery", { callback_query_id: q.id, text: "પહેલેથી નક્કી થઈ ગયું છે" });
    return "already decided";
  }
  if (what === "a") {
    await sql.query(`update stories set status = 'published', published_at = now(), updated_at = now(), hold_reason = null where id = $1`, [id]);
    await touched(sql);
  } else {
    await sql.query(`update stories set status = 'withdrawn', hold_reason = 'rejected by the editor' where id = $1`, [id]);
  }
  await sql.query(`update approvals set decided_at = now(), decision = $2, decided_by = $3 where story_id = $1`,
    [id, what === "a" ? "approve" : "reject", q.from.first_name ?? String(q.from.id)]);
  await api("answerCallbackQuery", { callback_query_id: q.id, text: what === "a" ? "પ્રકાશિત થયું" : "નહીં મુકાય" });
  await api("editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
  await api("sendMessage", { chat_id: chat, reply_to_message_id: q.message.message_id,
    text: what === "a" ? `✅ ${q.from.first_name ?? ""}: પ્રકાશિત` : `❌ ${q.from.first_name ?? ""}: નહીં મુકાય` });
  return what === "a" ? "approved" : "rejected";
}

/** The presses since the last run, when the bot has no webhook (the engine run calls this). */
export async function pollUpdates(sql: Sql): Promise<number> {
  if (!telegramOn()) return 0;
  const info = await api("getWebhookInfo", {});
  if ((info.result as { url?: string })?.url) return 0; // the site takes them as they come
  const [st] = await sql.query(`select value from state where key = 'telegram_offset'`);
  const r = await api("getUpdates", { offset: st ? Number(st.value) : 0, timeout: 0, allowed_updates: ["callback_query"] });
  const updates = (r.result as Update[]) ?? [];
  for (const u of updates) await handleUpdate(sql, u);
  if (updates.length) {
    await sql.query(`insert into state (key, value) values ('telegram_offset', $1) on conflict (key) do update set value = excluded.value`,
      [String(updates.at(-1)!.update_id + 1)]);
  }
  return updates.length;
}
