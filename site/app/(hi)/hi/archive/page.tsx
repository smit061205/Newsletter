import { Archive } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { t } from "@/lib/i18n.ts";

export const revalidate = 3600;
export const metadata = pageMeta({ lang: "hi", path: "/archive", title: t("hi", "archive") });
export default function Page() { return <Archive lang="hi" />; }
