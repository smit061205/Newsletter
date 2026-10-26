import { Epaper } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { t } from "@/lib/i18n.ts";

export const revalidate = 3600;
export const metadata = pageMeta({ lang: "hi", path: "/epaper", title: t("hi", "epTitle") });
export default function Page() { return <Epaper lang="hi" />; }
