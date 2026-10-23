"use client";
// જૂના અંક / Past issues: every day made, to open, reprint or publish again.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { call, media, type ArchiveRow } from "../api";
import { useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { longDate, num, rupees } from "../ui/format";
import { Badge, Button, Empty, Icon, Note, Skeleton, useApp } from "../ui/kit";

export default function Archive() {
  const { t, lang, setDate, pdf } = useApp();
  const { status } = useStatus();
  const router = useRouter();
  const [rows, setRows] = useState<ArchiveRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { call<ArchiveRow[]>("/api/issues").then(setRows).catch((e) => setError(e.message)); }, []);
  const open = (d: string) => { setDate(d); router.push("/newsroom"); };

  return (
    <div className={s.inner}>
      <h1 className={s.pageTitle}>{t("archive.title")}</h1>
      {error && <Note tone="bad">{error}</Note>}
      <section className={s.card}>
        {!rows ? <>{[0, 1, 2].map((i) => <Skeleton key={i} h={40} />)}</>
          : !rows.length ? <Empty icon={Icon.archive()} title={t("archive.none")} />
          : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.date}>
                      <td><strong>{longDate(lang, r.date, true)}</strong></td>
                      <td>{r.issueNumber ? t("archive.issue", { n: num(lang, r.issueNumber) }) : ""}</td>
                      <td>{r.status === "approved" ? <Badge tone="good" dot>{t("archive.published")}</Badge>
                        : r.ready ? <Badge tone="accent" dot>{t("archive.ready")}</Badge> : <Badge tone="warn" dot>{t("archive.look")}</Badge>}</td>
                      <td className={s.faint}>{num(lang, r.stories)} · {rupees(lang, r.cost, status?.inrPerUsd ?? 88)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <Button kind="quiet" icon={Icon.print()} onClick={() => pdf({ url: media(`/api/issues/${r.date}/pdf`), title: t("pdf.title", { issue: num(lang, r.issueNumber ?? "") }),
                          fileName: `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${r.issueNumber ?? ""} - ${r.date.split("-").reverse().join("-")}.pdf` })}>PDF</Button>
                        <Button kind="quiet" icon={Icon.download()} onClick={() => pdf({ url: media(`/api/issues/${r.date}/editable.pdf`),
                          title: t("corel.title", { what: t("pdf.title", { issue: num(lang, r.issueNumber ?? "") }) }),
                          fileName: `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${r.issueNumber ?? ""} - ${r.date.split("-").reverse().join("-")} - CorelDRAW.pdf` })}>{t("corel.short")}</Button>
                        <Button onClick={() => open(r.date)}>{t("archive.open")}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}
