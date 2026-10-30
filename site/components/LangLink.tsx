"use client";
// A link to this page in another language that keeps the reader's pick (lib/langchoice.ts), so the language
// chosen from where they are (proxy.ts) never overrides it. Each language has its own root layout, so a change of
// language is always a full page load: a plain link goes straight there, where next/link first asked for the page
// in vain and then loaded it again (the user, 30 Oct: "too much time changing the language", 0.75 s lost, once 30 s).
// The moment a finger or the mouse reaches the link, the page is fetched ahead, so it opens at once.
import type { Lang } from "../lib/types.ts";
import { chooseLang } from "../lib/langchoice.ts";

function fetchAhead(href: string) {
  if (document.head.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "prefetch"; l.as = "document"; l.href = href;
  document.head.append(l);
}

export default function LangLink({ to, href, ...rest }: { to: Lang; href: string } & Omit<React.ComponentProps<"a">, "onClick" | "href">) {
  const ahead = () => fetchAhead(href);
  return <a {...rest} href={href} onClick={() => chooseLang(to)} onPointerEnter={ahead} onTouchStart={ahead} onFocus={ahead} />;
}
