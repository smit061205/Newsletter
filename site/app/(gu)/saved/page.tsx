import { SavedPage } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { t } from "@/lib/i18n.ts";

export const metadata = { ...pageMeta({ lang: "gu", path: "/saved", title: t("gu", "savedTitle") }), robots: { index: false } };
export default function Page() { return <SavedPage lang="gu" />; }
