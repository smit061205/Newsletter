// Between the engine's rounds (.github/workflows/site-engine.yml sleeps here): the
// editors' Telegram messages, answered within seconds instead of
// at the next round. Ends by itself after the seconds it's given.
// Run: node --experimental-strip-types site/engine/listen.ts 840   (DATABASE_URL, TELEGRAM_BOT_TOKEN)
import { neon } from "@neondatabase/serverless";
import { pollUpdates } from "../lib/telegram.ts";

const url = process.env.DATABASE_URL;
if (!url || !process.env.TELEGRAM_BOT_TOKEN) process.exit(0);
const sql = neon(url);
const until = Date.now() + Number(process.argv[2] ?? 0) * 1000;
const pause = (s: number) => new Promise((r) => setTimeout(r, Math.max(0, s) * 1000));

while (Date.now() < until - 5000) {
  const left = Math.floor((until - Date.now()) / 1000) - 3;
  try {
    const n = await pollUpdates(sql, Math.min(50, left));
    if (n === null) await pause(left); // a webhook: the site answers them
    else if (n) console.log(`telegram: ${n} answered`);
  } catch (e) {
    console.log(`telegram: ${(e as Error).message}`);
    await pause(Math.min(10, left));
  }
}
