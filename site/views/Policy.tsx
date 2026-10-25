// The pages a news site needs and Google News looks for (ROADMAP §4): who we
// are, how we work, how to reach us, and the rules. Plain words, both languages.
import { notFound } from "next/navigation";
import type { Lang } from "../lib/types.ts";
import { PAPER } from "../lib/site.ts";
import { num } from "../lib/format.ts";
import Frame from "../components/Frame.tsx";

type Page = { title: string; paras: string[] };
const contact = (lang: Lang) => lang === "gu"
  ? `ઈમેલ: ${PAPER.email} · ફોન: ${num(PAPER.phone, "gu")} · ${PAPER.gu.place}, ગુજરાત`
  : `Email: ${PAPER.email} · Phone: ${PAPER.phone} · ${PAPER.en.place}, Gujarat`;

export const POLICY: Record<string, Record<Lang, Page>> = {
  about: {
    gu: { title: "અમારા વિશે", paras: [
      `કેપિટલ ક્રાંતિ ગાંધીનગરથી પ્રકાશિત થતું ગુજરાતી દૈનિક છે (RNI ${PAPER.rni}). ગુજરાતના પાટનગરથી, ${num(PAPER.founded, "gu")}થી, અમે સરકાર, ખેતી, અર્થતંત્ર, શિક્ષણ અને સમાજના સમાચાર વાચકો સુધી પહોંચાડીએ છીએ.`,
      "આ વેબસાઇટ પર દરરોજ સાંજે છપાયેલા પેપરના સમાચાર, આખું ઈ-પેપર અને જૂના અંકો મળે છે. સમાચાર ગુજરાતીમાં અને અંગ્રેજીમાં વાંચી શકાય છે.",
      "અમારું સૂત્ર છે: સમાજનો વિવેકપૂર્ણ દ્રષ્ટિકોણ. અમે હકીકતો આપીએ છીએ, સ્રોત જણાવીએ છીએ અને ભૂલ થાય તો ખુલ્લેઆમ સુધારીએ છીએ.",
    ] },
    en: { title: "About us", paras: [
      `Capital Kranti is a Gujarati daily newspaper published from Gandhinagar (RNI ${PAPER.rni}). From Gujarat’s capital, since ${PAPER.founded}, it has brought readers the news of government, farming, the economy, education and society.`,
      "This website carries the stories of each evening’s printed paper, the full e-paper and past issues. Stories can be read in Gujarati and in English.",
      "Our motto is “a thoughtful view of society”. We give the facts, say where they come from, and correct mistakes openly.",
    ] },
  },
  "editorial-policy": {
    gu: { title: "સંપાદકીય નીતિ", paras: [
      "સ્રોત: અમારા સમાચાર મુખ્યત્વે સત્તાવાર સ્રોતો પરથી છે: પત્ર સૂચના કાર્યાલય (PIB), ગુજરાતના મુખ્યમંત્રી કાર્યાલય અને આકાશવાણી. દરેક સમાચારના અંતે તેનો સ્રોત લિંક સાથે આપેલો છે.",
      "અમારા શબ્દોમાં: સમાચાર અમે અમારા શબ્દોમાં લખીએ છીએ; બીજા માધ્યમોનું લખાણ કે ફોટા લેતા નથી. ફોટા સરકારી સ્રોતના છે અને તેનો સ્રોત લખેલો છે.",
      "સંવેદનશીલ સમાચાર: મૃત્યુ, અકસ્માત, ગુના કે કોઈ વ્યક્તિ સામેના આક્ષેપો જેવા સમાચાર સંપાદક જોયા પછી જ પ્રકાશિત થાય છે.",
      "જાહેરાત અને સમાચાર અલગ: પૈસા લઈને સમાચાર છાપવામાં આવતા નથી. જાહેરાત હંમેશાં જાહેરાત તરીકે ઓળખાશે.",
    ] },
    en: { title: "Editorial policy", paras: [
      "Sources: our stories come mainly from official sources: the Press Information Bureau (PIB), the Gujarat Chief Minister’s office and All India Radio. Every story ends with its source and a link.",
      "In our own words: we write stories in our own words and never take other outlets’ text or photos. Photos come from government sources and say so.",
      "Sensitive stories: deaths, accidents, crime and allegations against named people are published only after the editor has seen them.",
      "News is not for sale: we do not publish news for payment. Advertising is always marked as advertising.",
    ] },
  },
  "how-we-check": {
    gu: { title: "અમે સમાચાર કેવી રીતે ચકાસીએ છીએ", paras: [
      "દરેક આંકડો: સમાચારમાંનો દરેક આંકડો (રકમ, તારીખ, સંખ્યા) મૂળ સ્રોત સાથે મેળવવામાં આવે છે. મેળ ન ખાય તો સમાચાર સંપાદક પાસે જાય છે; બધા આંકડા મેળ ખાય ત્યારે જ સમાચાર પર “આંકડા મૂળ સ્રોત સાથે ચકાસેલા” લખાય છે.",
      "અંગ્રેજી અનુવાદ: અંગ્રેજી અનુવાદના આંકડા પણ ગુજરાતી સમાચાર સાથે મેળવાય છે. મેળ ન ખાય તો અંગ્રેજીમાં પણ ગુજરાતી સમાચાર જ બતાવાય છે.",
      "એક જ વાત બે વાર નહીં: એક જ સમાચારમાં એક વાક્ય બે વાર ન આવે અને એક જ ઘટના બે સમાચાર તરીકે ન છપાય તેની ચકાસણી થાય છે.",
      "સ્રોત હંમેશાં: દરેક સમાચારના અંતે મૂળ સ્રોતની લિંક હોય છે, જેથી વાચક જાતે મેળવી શકે.",
    ] },
    en: { title: "How we check the news", paras: [
      "Every number: each number in a story (amounts, dates, counts) is matched against the original source. If one doesn’t match, the story goes to the editor; only a story whose numbers all match carries “Numbers checked against the original source”.",
      "English versions: the numbers in each English version are matched against the Gujarati story too. If they don’t match, the English page shows the Gujarati story instead.",
      "Nothing said twice: we check that no sentence repeats within a story and that one event isn’t printed as two stories.",
      "Always the source: every story ends with a link to its original source, so readers can check it themselves.",
    ] },
  },
  corrections: {
    gu: { title: "સુધારા", paras: [
      "ભૂલ થાય તો અમે તેને ખુલ્લેઆમ સુધારીએ છીએ. સુધારેલા સમાચારની ઉપર તારીખ સાથે નોંધ મુકાય છે કે શું બદલાયું. ચૂપચાપ ફેરફાર કરવામાં આવતો નથી.",
      "ભૂલ દેખાય તો દરેક સમાચારના અંતે “ભૂલ દેખાય? અમને જણાવો” દબાવો, અથવા અમને લખો: " + PAPER.email + ".",
    ] },
    en: { title: "Corrections", paras: [
      "When we make a mistake, we correct it openly. A corrected story carries a dated note at the top saying what changed. We never change a story silently.",
      "If you spot a mistake, press “Spotted a mistake? Tell us” at the end of the story, or write to us: " + PAPER.email + ".",
    ] },
  },
  contact: {
    gu: { title: "સંપર્ક", paras: [contact("gu"), "સમાચાર, ભૂલ, જાહેરાત કે અન્ય કોઈ બાબત માટે ઈમેલ કરો. અમે જલદી જવાબ આપીશું."] },
    en: { title: "Contact", paras: [contact("en"), "Email us about news, a mistake, advertising or anything else. We’ll reply as soon as we can."] },
  },
  terms: {
    gu: { title: "ઉપયોગના નિયમો", paras: [
      "આ વેબસાઇટના સમાચાર, ફોટા અને ઈ-પેપર કેપિટલ ક્રાંતિના છે (સરકારી સ્રોતના ફોટા તેમના સ્રોતના). અંગત વાંચન માટે ઉપયોગ કરો; સમાચારની લિંક મોકલવાનું સ્વાગત છે.",
      "આખા સમાચાર કે ઈ-પેપર બીજે ફરી પ્રકાશિત કરવા હોય તો પહેલાં અમારી લેખિત મંજૂરી લો.",
      "અમે સમાચાર સાચા રાખવા પૂરો પ્રયત્ન કરીએ છીએ; ભૂલ દેખાય તો જણાવો, અમે સુધારીશું.",
    ] },
    en: { title: "Terms of use", paras: [
      "The stories, photos and e-paper on this website belong to Capital Kranti (photos from government sources to their sources). Use them for personal reading; sharing links to stories is welcome.",
      "To republish whole stories or the e-paper elsewhere, ask us for written permission first.",
      "We do our best to keep every story accurate; if you spot a mistake, tell us and we will correct it.",
    ] },
  },
  privacy: {
    gu: { title: "ગોપનીયતા", paras: [
      "આ વેબસાઇટ વાંચવા માટે ખાતું કે સાઇન-ઇન જરૂરી નથી. અમે તમારી માહિતી વેચતા નથી અને જાહેરાત માટે તમને ટ્રૅક કરતા નથી.",
      "તમારો દેખાવ (લાઇટ/ડાર્ક), અક્ષરનું કદ અને સાચવેલા સમાચાર ફક્ત તમારા પોતાના બ્રાઉઝરમાં રહે છે; અમારી પાસે આવતા નથી.",
      "વેબસાઇટ ચલાવતી સેવા (Vercel) સુરક્ષા માટે થોડા સમય માટે સામાન્ય ટેકનિકલ લૉગ રાખે છે.",
      "પ્રશ્ન હોય તો લખો: " + PAPER.email + ".",
    ] },
    en: { title: "Privacy", paras: [
      "You don’t need an account or sign-in to read this website. We don’t sell your information and don’t track you for advertising.",
      "Your appearance (light or dark), text size and saved stories stay in your own browser only; they never reach us.",
      "The service that runs the website (Vercel) keeps ordinary technical logs for a short time, for security.",
      "Questions? Write to " + PAPER.email + ".",
    ] },
  },
};

export default function Policy({ page, lang }: { page: string; lang: Lang }) {
  const p = POLICY[page]?.[lang];
  if (!p) notFound();
  return (
    <Frame lang={lang} path={`/${page}`}>
      <article className="art prose" style={{ paddingTop: 20 }}>
        <h1>{p.title}</h1>
        <div className="body">{p.paras.map((x, i) => <p key={i}>{x}</p>)}</div>
      </article>
    </Frame>
  );
}
