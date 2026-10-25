import Link from "next/link";
import Frame from "@/components/Frame.tsx";
import { href, t } from "@/lib/i18n.ts";

export default function NotFound() {
  return (
    <Frame lang="en" path="/">
      <div className="sechead"><h1>{t("en", "notFoundTitle")}</h1></div>
      <p className="empty">{t("en", "notFoundText")}</p>
      <Link className="more" href={href("en", "/")}>{t("en", "back")}</Link>
    </Frame>
  );
}
