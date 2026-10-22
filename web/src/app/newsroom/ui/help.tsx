"use client";
// The editor's guide, in a side panel, in the chosen language.
import s from "../newsroom.module.css";
import { SidePanel, useApp } from "./kit";

const GU = (
  <>
    <h3>દરરોજ</h3>
    <ol>
      <li>કમ્પ્યુટર ચાલુ રાખો: નક્કી કરેલા સમયે (સાંજે ૮ વાગ્યે) છાપું આપમેળે બને છે.</li>
      <li><b>આજે</b> માં જુઓ: “તૈયાર છે” દેખાય એટલે પાનાં જુઓ.</li>
      <li><b>છાપું</b> માં કોઈ પણ સમાચાર પર ક્લિક કરો — શીર્ષક, લખાણ, ફોટો કે મહત્વ બદલો, અથવા છાપામાંથી કાઢો.</li>
      <li><b>પ્રકાશિત કરો</b> દબાવો: છાપું વેબસાઇટ પર આવે છે. <b>PDF છાપવા માટે</b> પ્રિન્ટરને મોકલો.</li>
    </ol>
    <h3>“હિન્દીમાંથી” લખેલા સમાચાર</h3>
    <p>ગુજરાતી સમાચાર ઓછા પડે ત્યારે PIB ના હિન્દી સમાચારનો અનુવાદ થાય છે. સુધારતી વખતે બાજુમાં મૂળ હિન્દી દેખાય છે.</p>
    <h3>જાહેરાત</h3>
    <p><b>જાહેરાત</b> માં છબી, માપ, પાનું અને તારીખ આપી બુક કરો.</p>
    <h3>કંઈ અટકે તો</h3>
    <ul>
      <li>“ફરી પ્રયત્ન કરો” દબાવો — અત્યાર સુધીનું કામ સચવાયેલું રહે છે.</li>
      <li>PIB જવાબ ન આપે તો એપ થોડી વાર પછી જાતે ફરી પ્રયત્ન કરે છે.</li>
      <li>એપ ખુલે નહીં તો કમ્પ્યુટર ફરી શરૂ કરો.</li>
    </ul>
  </>
);
const EN = (
  <>
    <h3>Every day</h3>
    <ol>
      <li>Leave the computer on: the paper makes itself at the set time (8 PM).</li>
      <li>Look at <b>Today</b>: when it says “ready”, look at the pages.</li>
      <li>In <b>Paper</b>, click any story to change its headline, text, photo or importance, or leave it out.</li>
      <li>Press <b>Publish</b>: the paper goes on the website. Send <b>Print PDF</b> to the printer.</li>
    </ol>
    <h3>Stories marked “From Hindi”</h3>
    <p>When the Gujarati news is short, PIB’s Hindi news is translated. While editing, the Hindi original shows alongside.</p>
    <h3>Ads</h3>
    <p>In <b>Ads</b>, book an ad with its image, size, page and dates.</p>
    <h3>If something stops</h3>
    <ul>
      <li>Press “Try again” — everything done so far is kept.</li>
      <li>If PIB isn’t answering, the app tries again by itself after a while.</li>
      <li>If the app won’t open, restart the computer.</li>
    </ul>
  </>
);

export function Help({ onClose }: { onClose: () => void }) {
  const { lang, t } = useApp();
  return <SidePanel title={t("help.title")} onClose={onClose}><div className={s.help}>{lang === "gu" ? GU : EN}</div></SidePanel>;
}
