import { Epaper } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { t } from "@/lib/i18n.ts";

export const revalidate = 3600;
export const metadata = pageMeta({ lang: "gu", path: "/epaper", title: t("gu", "epTitle") });
export default function Page() { return <Epaper lang="gu" />; }
