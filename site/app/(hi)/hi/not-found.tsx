import Link from "next/link";
import Frame from "@/components/Frame.tsx";
import { href, t } from "@/lib/i18n.ts";

export default function NotFound() {
  return (
    <Frame lang="hi" path="/">
      <div className="sechead"><h1>{t("hi", "notFoundTitle")}</h1></div>
      <p className="empty">{t("hi", "notFoundText")}</p>
      <Link className="more" href={href("hi", "/")}>{t("hi", "back")}</Link>
    </Frame>
  );
}
