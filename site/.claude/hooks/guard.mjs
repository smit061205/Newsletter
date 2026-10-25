// Keeps a Claude Code session opened in site/ to the website (CLAUDE.md: the
// app is never changed for the website). Runs before every edit and shell
// command; exit code 2 refuses it and tells Claude why.
//
// Allowed: site/, docs/website/, .github/workflows/site*.yml, and the shared
// notes CLAUDE.md and HANDOFF.md. Anything else in the repository is the app's.
// Only acts when the session's folder is site/: a session opened at the
// repository's top (the app's) never loads this file anyway.
import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const project = process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
if (basename(project) !== "site") process.exit(0);
const root = dirname(project);
const cwd = input.cwd ?? project;

const ALLOWED = [/^site(\/|$)/, /^docs\/website(\/|$)/, /^\.github\/workflows\/site[^/]*\.ya?ml$/, /^CLAUDE\.md$/, /^HANDOFF\.md$/];
/** The path's place in the repository, or null when it's outside it (scratch files, /tmp). */
function inRepo(p) {
  const rel = relative(root, isAbsolute(p) ? p : resolve(cwd, p));
  return rel.startsWith("..") || isAbsolute(rel) ? null : rel || ".";
}
const allowed = (rel) => ALLOWED.some((re) => re.test(rel));
function refuse(why) {
  process.stderr.write(`Refused by site/.claude/hooks/guard.mjs: ${why}\n` +
    "This session is for the website only; the app's code (backend/, web/, desktop/, shared/, publications/, ...) is never changed from here. " +
    "If the user really wants an app change, they make it in a session opened at the repository's top folder.\n");
  process.exit(2);
}

const tool = input.tool_name;
const args = input.tool_input ?? {};
if (tool !== "Bash") {
  const p = args.file_path ?? args.notebook_path;
  const rel = p && inRepo(p);
  if (rel && !allowed(rel)) refuse(`${tool} on ${rel}, which is outside the website's folders.`);
  process.exit(0);
}

// Shell commands: a best-effort check (the GitHub guard, site-guard.yml, is the backstop).
const cmd = String(args.command ?? "");
// git commands that sweep the whole repository, the app's changes included
if (/\bgit\s+(add\s+(-A|--all)\b|commit\b[^|;&]*\s(-a|--all|-[b-zA-Z]*a[a-zA-Z]*)(?=\s|$)|reset\s+--hard|clean\s|stash\b|checkout\s+(--\s+)?\.(\s|$)|restore\s+[^|;&]*\.(\s|$))/.test(cmd)) {
  refuse("a git command that acts on the whole repository (it would sweep up or discard the app's work). Use `git add .` inside site/, or name the files.");
}
const WRITES = /(^|[\s;&|(])(>>?|tee|rm|mv|cp|touch|mkdir|ln|chmod|truncate|patch|install)(\s|$)|\bsed\s+(-[a-zA-Z]*i|--in-place)|\bperl\s+-[a-zA-Z]*i|\bgit\s+(checkout|restore|rm|mv|apply|am)\b|\bnpm\s+(i|install|uninstall|update|ci)\b|>/;
if (WRITES.test(cmd)) {
  // every path-like word the command names (cd targets included)
  const words = cmd.match(/(?:\.\.?\/|\/|~\/)?[\w.@-]+(?:\/[\w.*@-]+)+\/?|\.\.(?=[\s;&|)]|$)/g) ?? [];
  for (const w of words) {
    const rel = inRepo(w.startsWith("~/") ? resolve(process.env.HOME ?? "/", w.slice(2)) : w);
    if (rel && rel !== "." && !allowed(rel)) refuse(`a command that writes and names ${rel}, outside the website's folders.`);
    if (rel === ".") refuse("a command that writes and names the repository's top folder.");
  }
  if (/--prefix\s+\.\.(\s|$)/.test(cmd)) refuse("an npm command on the repository's top folder (the app's packages).");
}
process.exit(0);
