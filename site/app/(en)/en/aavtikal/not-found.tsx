import Link from "next/link";
import s from "@/components/flagship/fl.module.css";
import Frame, { fl } from "@/components/flagship/Frame.tsx";
import { flw } from "@/lib/flagship.ts";
import { t } from "@/lib/i18n.ts";

export default function NotFound() {
  return (
    <Frame lang="en" path="">
      <h1 className={s.huge} style={{ paddingTop: 20 }}>{t("en", "notFoundTitle")}</h1>
      <p className={s.empty}>{t("en", "notFoundText")}</p>
      <p className={s.empty}><Link href={fl("en")}>{flw("en").home}</Link></p>
    </Frame>
  );
}
