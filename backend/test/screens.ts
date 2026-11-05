// Every newsroom screen, opened the way the editor opens it, in Gujarati: a
// screen fails on a page error, a console error, an engine call answering
// 500, or English words on it (the editor reads Gujarati; English is a
// switch). Names that are English on the editor's own screens too (CorelDRAW,
// PIB, ...) are allowed below, and so is text marked as another language (a
// release as PIB wrote it: lang="en") or not to translate (the version). Run against a started app (scripts/launch.mjs,
// or the dev ports):
//
//   node --experimental-strip-types --no-warnings backend/test/screens.ts [http://127.0.0.1:3000] [http://127.0.0.1:4000]
//
// Exits non-zero when a screen fails. Changes the app's settings only to say
// the welcome was seen and the language is Gujarati: run it on a scratch app.
import { chromium } from "playwright";

const [site = "http://127.0.0.1:3000", engine = "http://127.0.0.1:4000"] = process.argv.slice(2);
const SCREENS = ["welcome", "", "ads", "copies", "archive", "settings", "settings#more", "pages", "stories", "papers", "news", "review"];
/** English the Gujarati screens may show: names, and what the editor types or reads as is. */
const ALLOWED = new Set(["AI", "PIB", "PDF", "CorelDRAW", "OpenRouter", "Telegram", "English", "US", "Capital", "Kranti",
  "Windows", "Mac", "Wikipedia", "Commons", "RSS", "OK", "JPG", "PNG", "MB", "BotFather", "Keys", "sk-or-"]);

const settings = (json: object) => fetch(`${engine}/api/settings`, { method: "POST", headers: { "content-type": "application/json", origin: site }, body: JSON.stringify(json) });
await settings({ lang: "gu", onboarded: false });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let failures = 0;
for (const screen of SCREENS) {
  if (screen === "") await settings({ onboarded: true });
  const problems: string[] = [];
  const onConsole = (m: import("playwright").ConsoleMessage) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`); };
  const onError = (e: Error) => problems.push(`page error: ${e.message.slice(0, 200)}`);
  const onResponse = (r: import("playwright").Response) => { if (r.status() >= 500) problems.push(`${r.status()} from ${r.url()}`); };
  page.on("console", onConsole);
  page.on("pageerror", onError);
  page.on("response", onResponse);
  await page.goto(`${site}/newsroom/${screen}`, { waitUntil: "networkidle" });
  // (the screen settled: its loading placeholders gone)
  await page.waitForTimeout(1500);
  // what the editor reads: the visible text, and the names buttons and fields give
  const text = await page.evaluate(() => {
    Array.from(document.querySelectorAll("details")).forEach((d) => { d.open = true; });
    const apart = Array.from(document.querySelectorAll<HTMLElement>('[lang]:not([lang^="gu"]):not(html), [translate="no"]'));
    for (const e of apart) e.style.display = "none";
    const named = Array.from(document.querySelectorAll("[aria-label],[title]")).filter((e) => !apart.some((a) => a.contains(e)))
      .map((e) => `${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("title") ?? ""}`);
    const text = `${document.body.innerText}\n${named.join("\n")}`;
    for (const e of apart) e.style.display = "";
    return text;
  });
  // (a web address is what it is)
  const english = [...new Set((text.replace(/https?:\/\/\S+/g, "").match(/[A-Za-z][A-Za-z'’-]+/g) ?? []).filter((w) => !ALLOWED.has(w)))];
  if (english.length) problems.push(`English on a Gujarati screen: ${english.slice(0, 20).join(", ")}`);
  page.off("console", onConsole);
  page.off("pageerror", onError);
  page.off("response", onResponse);
  console.log(`${problems.length ? "FAILED" : "ok    "} /newsroom/${screen}`);
  for (const p of problems) console.log(`         ${p}`);
  if (problems.length) failures++;
}
await browser.close();
process.exitCode = failures ? 1 : 0;
