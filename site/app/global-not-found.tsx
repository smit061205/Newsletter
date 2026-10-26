// A web address that matches nothing (two root layouts, one per language, so this stands alone).
import "./globals.css";
import { Anek_Gujarati } from "next/font/google";

const ui = Anek_Gujarati({ subsets: ["gujarati", "latin"], variable: "--font-ui" });
export const metadata = { title: "પાનું મળ્યું નહીં | કેપિટલ ક્રાંતિ", robots: { index: false } };

export default function GlobalNotFound() {
  return (
    <html lang="gu" className={ui.variable}>
      <body>
        <main className="wrap" style={{ paddingBlock: "15vh", textAlign: "center" }}>
          <a className="wm" href="/" style={{ justifyContent: "center" }}><b>કેપિટલ ક્રાંતિ</b></a>
          <h1 className="h3" style={{ marginTop: 32 }}>આ પાનું મળ્યું નહીં</h1>
          <p className="note" lang="en">This page isn’t here.</p>
          <p><a className="more" href="/">હોમ પર જાઓ</a> · <a className="more" href="/hi" lang="hi">होम हिंदी में</a> · <a className="more" href="/en" lang="en">Home in English</a></p>
        </main>
      </body>
    </html>
  );
}
