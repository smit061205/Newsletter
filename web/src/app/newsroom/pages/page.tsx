"use client";
// છાપું / Paper: the pages as they'll print (ui/PaperView), with the paper's
// files. Tonight's paper shows the same pages under the day's status; this
// screen stays for links to it, out of the sidebar.
import Link from "next/link";
import { useEffect, useState } from "react";
import { call, media, type IssueInfo } from "../api";
import { TopBar, useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { num } from "../ui/format";
import { Button, Empty, Icon, Note, useApp } from "../ui/kit";
import { PaperView } from "../ui/PaperView";

export default function Paper() {
  const { t, lang, date, toast, pdf } = useApp();
  const { status, refresh } = useStatus();
  const [info, setInfo] = useState<IssueInfo | null>(null);
  const [error, setError] = useState("");
  const has = !!status?.issue;
  const version = status?.issue?.version;
  useEffect(() => {
    setInfo(null);
    if (has) call<IssueInfo>(`/api/issues/${date}`).then(setInfo).catch((e) => setError(e.message));
  }, [date, has, version]);
  const running = !!status?.running && status.running.date === date;
  // the day's paper, or its 8-page paper (once the evening has made it)
  const [pages, setPages] = useState<4 | 8>(4);
  const eight = pages === 8 && !!info?.eight;

  const rebuild = async () => {
    setError("");
    try { await call(`/api/issues/${date}/build`, { json: {} }); toast(t("paper.rebuilding")); refresh(); }
    catch (e) { setError((e as Error).message); }
  };
  const fileName = (what: string) => `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${info?.report.issueNumber ?? ""} - ${date.split("-").reverse().join("-")}${eight ? " - 8" : ""}${what}.pdf`;
  const pdfTitle = () => t(eight ? "pdf.title8" : "pdf.title", { issue: num(lang, info!.report.issueNumber) });

  if (!has) {
    return (
      <div className={s.inner}>
        <TopBar title={t("paper.title")} />
        <div className={s.card}><Empty icon={Icon.paper()} title={t("paper.none")}><Link className={`${s.btn} ${s.primary}`} href="/newsroom">{t("today.make")}</Link></Empty></div>
      </div>
    );
  }
  return (
    <div className={`${s.inner} ${s.wide}`}>
      <TopBar title={t("paper.title")}>
        {info?.eight && <div className={s.segmented} role="radiogroup" aria-label={t("copies.pages")}>
          {([4, 8] as const).map((k) => <button key={k} type="button" aria-pressed={pages === k} onClick={() => setPages(k)}>{t("copies.pages.n", { n: num(lang, k) })}</button>)}
        </div>}
        <Button kind="quiet" icon={Icon.refresh()} onClick={rebuild} disabled={running}>{running ? t("paper.rebuilding") : t("paper.rebuild")}</Button>
        <Button icon={Icon.print()} disabled={!info} onClick={() => info && pdf({ url: media(`/api/issues/${date}/${eight ? "pdf8" : "pdf"}`),
          title: pdfTitle(), fileName: fileName("") })}>{t("today.print")}</Button>
        {status?.paper.lang !== "hi" && status?.paper.lang !== "ur" && (!eight || info?.eightEditable) && <Button kind="primary" icon={Icon.download()} disabled={!info} onClick={() => info && pdf({ url: media(`/api/issues/${date}/${eight ? "editable8.pdf" : "editable.pdf"}`),
          title: t("corel.title", { what: pdfTitle() }), fileName: fileName(" - CorelDRAW") })}>{t("corel.pdf")}</Button>}
      </TopBar>
      {error && <Note tone="bad">{error}</Note>}
      <PaperView problems eight={eight} />
    </div>
  );
}
