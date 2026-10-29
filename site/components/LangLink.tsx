"use client";
// A link to this page in another language that keeps the reader's pick (lib/langchoice.ts), so the language
// chosen from where they are (proxy.ts) never overrides it.
import Link from "next/link";
import type { Lang } from "../lib/types.ts";
import { chooseLang } from "../lib/langchoice.ts";

export default function LangLink({ to, ...rest }: { to: Lang } & Omit<React.ComponentProps<typeof Link>, "onClick">) {
  return <Link {...rest} onClick={() => chooseLang(to)} />;
}
