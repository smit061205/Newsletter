import { SavedPage } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { t } from "@/lib/i18n.ts";

export const metadata = { ...pageMeta({ lang: "hi", path: "/saved", title: t("hi", "savedTitle") }), robots: { index: false } };
export default function Page() { return <SavedPage lang="hi" />; }
