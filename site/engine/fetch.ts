// Asking a site for a page, politely (ROADMAP §2): one request at a time per
// site with a pause, a user agent naming the paper, robots.txt obeyed, and
// "nothing new" answered from the last answer's ETag / Last-Modified. A site
// that refuses us is not asked again by other means: the caller switches the
// source off and the dashboard says so.

// names the paper honestly, as the app's PIB reader does (backend/src/ingest/pib.ts)
export const UA = "CapitalKranti-news-ingest/1.0 (+https://capital-kranti.vercel.app/about)";
const PAUSE_MS = 1500;
const TIMEOUT_MS = 25_000;
const MAX_BYTES = 3_000_000;

export interface Answer {
  status: number;          // 0: no answer at all
  text: string;
  etag?: string;
  lastModified?: string;
  /** 401, 403, 451 or robots.txt: this site doesn't want us; never worked around */
  refused: boolean;
  error?: string;
  url: string;
}

const lastAsked = new Map<string, number>();
async function politely(host: string) {
  const wait = (lastAsked.get(host) ?? 0) + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAsked.set(host, Date.now());
}

// robots.txt, read once per site per run: the rules for "*" and for our agent
const robots = new Map<string, Promise<string[]>>();
async function disallowed(u: URL): Promise<string[]> {
  if (!robots.has(u.host)) {
    robots.set(u.host, (async () => {
      try {
        await politely(u.host);
        const res = await fetch(`${u.protocol}//${u.host}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
        if (!res.ok) return [];
        const rules: string[] = [];
        let applies = false, inGroup = false;
        for (const raw of (await res.text()).split(/\r?\n/)) {
          const line = raw.replace(/#.*/, "").trim();
          const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
          if (!m) continue;
          const [k, v] = [m[1].toLowerCase(), m[2].trim()];
          if (k === "user-agent") {
            if (!inGroup) applies = false;
            inGroup = true;
            if (v === "*" || /capitalkranti/i.test(v)) applies = true;
          } else {
            inGroup = false;
            if (applies && k === "disallow" && v) rules.push(v);
          }
        }
        return rules;
      } catch {
        return [];
      }
    })());
  }
  return robots.get(u.host)!;
}
const matches = (path: string, rule: string) => {
  const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
};

/** One page or feed. `since` carries the last answer's validators. */
export async function ask(url: string, since: { etag?: string | null; lastModified?: string | null } = {}): Promise<Answer> {
  let u: URL;
  try { u = new URL(url); } catch { return { status: 0, text: "", refused: false, error: "not an address", url }; }
  const rules = await disallowed(u);
  if (rules.some((r) => matches(u.pathname + u.search, r))) {
    return { status: 0, text: "", refused: true, error: "robots.txt asks programs not to read this", url };
  }
  await politely(u.host);
  const headers: Record<string, string> = { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5" };
  if (since.etag) headers["if-none-match"] = since.etag;
  if (since.lastModified) headers["if-modified-since"] = since.lastModified;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    const buf = new Uint8Array(await res.arrayBuffer()).slice(0, MAX_BYTES);
    const text = decode(buf, res.headers.get("content-type") ?? "");
    return {
      status: res.status, text, url: res.url || url,
      etag: res.headers.get("etag") ?? undefined, lastModified: res.headers.get("last-modified") ?? undefined,
      refused: res.status === 401 || res.status === 403 || res.status === 451,
    };
  } catch (e) {
    return { status: 0, text: "", refused: false, error: e instanceof Error ? e.message : String(e), url };
  }
}

/** Text in the charset the page names (most are UTF-8; some old government sites aren't). */
function decode(buf: Uint8Array, contentType: string): string {
  const head = new TextDecoder("latin1").decode(buf.slice(0, 1024));
  const charset = (contentType.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/encoding=["']([\w-]+)["']/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
  try { return new TextDecoder(charset).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}
