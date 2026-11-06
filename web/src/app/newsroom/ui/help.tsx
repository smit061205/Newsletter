"use client";
// The editor's guide, in a side panel, in the chosen language.
import s from "../newsroom.module.css";
import { SidePanel, useApp } from "./kit";

const GU = (
  <>
    <h3>દરરોજ</h3>
    <ol>
      <li>કમ્પ્યુટર ચાલુ રાખો: નક્કી કરેલા સમયે (સાંજે ૮ વાગ્યે) છાપું આપમેળે બને છે.</li>
      <li><b>આજનું છાપું</b> માં જુઓ: “તૈયાર છે” દેખાય એટલે નીચે પાનાં જુઓ.</li>
      <li>પાના પર કોઈ પણ સમાચાર પર ક્લિક કરો — શીર્ષક, લખાણ, ફોટો કે મહત્વ બદલો, અથવા છાપામાંથી કાઢો.</li>
      <li><b>CorelDRAW માટે સાચવો</b> દબાવો અને CorelDRAW માં ખોલો. <b>છાપો</b> થી સીધું પ્રિન્ટર પર પણ મોકલી શકાય.</li>
    </ol>
    <h3>“હિન્દીમાંથી” લખેલા સમાચાર</h3>
    <p>ગુજરાતી સમાચાર ઓછા પડે ત્યારે PIB ના હિન્દી સમાચારનો અનુવાદ થાય છે. સુધારતી વખતે બાજુમાં મૂળ હિન્દી દેખાય છે.</p>
    <h3>જાહેરાત</h3>
    <p><b>જાહેરાત</b> માં ચાર પગલાં: ચિત્ર, માપ, પાના પર જગ્યા, અને દિવસ. મહિનાના કૅલેન્ડરમાં કયા દિવસે કેટલી જાહેરાત છે તે દેખાય છે.</p>
    <h3>બીજાં છાપાં</h3>
    <p><b>બીજાં છાપાં</b> માં આપણાં બીજાં છાપાં (હિન્દી, ઉર્દૂ વગેરે) બને છે, અને <b>નકલો</b> માં આજના છાપાની નકલો.</p>
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
      <li>Look at <b>Tonight's paper</b>: when it says “ready”, look at the pages below.</li>
      <li>Click any story on a page to change its headline, text, photo or importance, or leave it out.</li>
      <li>Press <b>Save for CorelDRAW</b> and open it in CorelDRAW. <b>Print</b> sends it straight to the printer.</li>
    </ol>
    <h3>Stories marked “From Hindi”</h3>
    <p>When the Gujarati news is short, PIB’s Hindi news is translated. While editing, the Hindi original shows alongside.</p>
    <h3>Ads</h3>
    <p>In <b>Ads</b>, four steps: the picture, its size, its place on the page, and its days. The month's calendar shows how many ads each day has.</p>
    <h3>Other papers</h3>
    <p>In <b>Other papers</b>, the sister papers (Hindi, Urdu and the rest) are made; in <b>Copies</b>, copies of the day's paper.</p>
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
