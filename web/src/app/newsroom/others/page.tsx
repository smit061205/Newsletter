"use client";
// બીજાં છાપાં / Other papers: the day's sister papers (../copies/Editions.tsx), each
// the day's paper under another name, in Gujarati, Hindi or Urdu. Copies of the
// day's paper have their own screen (../copies; the developer, 6 Nov).
import Link from "next/link";
import { TopBar, useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { Editions } from "../copies/Editions";
import { Empty, Icon, useApp } from "../ui/kit";

export default function OtherPapers() {
  const { t } = useApp();
  const { status } = useStatus();
  return (
    <div className={s.inner}>
      <TopBar title={t("nav.others")} />
      {status?.issue ? <Editions />
        : <div className={s.card}><Empty icon={Icon.papers()} title={t("others.none")}><Link className={`${s.btn} ${s.primary}`} href="/newsroom">{t("today.make")}</Link></Empty></div>}
    </div>
  );
}
