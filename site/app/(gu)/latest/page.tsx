import { Latest } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { t } from "@/lib/i18n.ts";

export const revalidate = 3600;
export const metadata = pageMeta({ lang: "gu", path: "/latest", title: t("gu", "latestTitle") });
export default function Page() { return <Latest lang="gu" />; }
