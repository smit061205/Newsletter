// The pages a news site needs and Google News looks for (ROADMAP §4): who we
// are, how we work, how to reach us, and the rules. Plain words, in Gujarati, English and Hindi.
import { notFound } from "next/navigation";
import type { Lang } from "../lib/types.ts";
import { PAPER } from "../lib/site.ts";
import { num } from "../lib/format.ts";
import Frame from "../components/Frame.tsx";

type Page = { title: string; paras: string[] };
const contact = (lang: Lang) => ({
  gu: `ઈમેલ: ${PAPER.email} · ફોન: ${num(PAPER.phone, "gu")} · ${PAPER.gu.place}, ગુજરાત`,
  en: `Email: ${PAPER.email} · Phone: ${PAPER.phone} · ${PAPER.en.place}, Gujarat`,
  hi: `ईमेल: ${PAPER.email} · फ़ोन: ${PAPER.phone} · ${PAPER.hi.place}, गुजरात`,
})[lang];

export const POLICY: Record<string, Record<Lang, Page>> = {
  about: {
    gu: { title: "અમારા વિશે", paras: [
      `કેપિટલ ક્રાંતિ ગાંધીનગરથી પ્રકાશિત થતું ગુજરાતી દૈનિક છે (RNI ${PAPER.rni}). ગુજરાતના પાટનગરથી, ${num(PAPER.founded, "gu")}થી, અમે સરકાર, ખેતી, અર્થતંત્ર, શિક્ષણ અને સમાજના સમાચાર વાચકો સુધી પહોંચાડીએ છીએ.`,
      "આ વેબસાઇટ પર દિવસભર તાજા સમાચાર, દરરોજ સાંજે છપાયેલા પેપરના સમાચાર, આખું ઈ-પેપર અને જૂના અંકો મળે છે. સમાચાર ગુજરાતીમાં, અને દેશ-વિદેશના સમાચાર હિંદી અને અંગ્રેજીમાં પણ વાંચી શકાય છે.",
      "અમારું સૂત્ર છે: સમાજનો વિવેકપૂર્ણ દ્રષ્ટિકોણ. અમે હકીકતો આપીએ છીએ, સ્રોત જણાવીએ છીએ અને ભૂલ થાય તો ખુલ્લેઆમ સુધારીએ છીએ.",
    ] },
    en: { title: "About us", paras: [
      `Capital Kranti is a Gujarati daily newspaper published from Gandhinagar (RNI ${PAPER.rni}). From Gujarat’s capital, since ${PAPER.founded}, it has brought readers the news of government, farming, the economy, education and society.`,
      "This website carries the latest news through the day, the stories of each evening’s printed paper, the full e-paper and past issues. Stories are in Gujarati; national and world stories are also in Hindi and English.",
      "Our motto is “a thoughtful view of society”. We give the facts, say where they come from, and correct mistakes openly.",
    ] },
    hi: { title: "हमारे बारे में", paras: [
      `कैपिटल क्रांति गांधीनगर से प्रकाशित होने वाला गुजराती दैनिक है (RNI ${PAPER.rni})। गुजरात की राजधानी से, ${PAPER.founded} से, हम सरकार, खेती, अर्थव्यवस्था, शिक्षा और समाज के समाचार पाठकों तक पहुँचाते हैं।`,
      "इस वेबसाइट पर दिन भर ताज़ा समाचार, हर शाम छपे अख़बार के समाचार, पूरा ई-पेपर और पुराने अंक मिलते हैं। समाचार गुजराती में हैं; देश और विदेश के समाचार हिंदी और अंग्रेज़ी में भी पढ़े जा सकते हैं।",
      "हमारा सूत्र है: समाज का विवेकपूर्ण दृष्टिकोण। हम तथ्य देते हैं, स्रोत बताते हैं और ग़लती होने पर खुलकर सुधारते हैं।",
    ] },
  },
  "editorial-policy": {
    gu: { title: "સંપાદકીય નીતિ", paras: [
      "સ્રોત: અમારા સમાચાર સત્તાવાર સ્રોતો (પત્ર સૂચના કાર્યાલય – PIB, મંત્રાલયો, રિઝર્વ બેંક, ગુજરાત સરકાર, વિદેશની સરકારો અને આંતરરાષ્ટ્રીય સંસ્થાઓ) અને જાણીતાં, વિશ્વસનીય સમાચાર માધ્યમો પરથી છે. દરેક સમાચારના અંતે તેના બધા સ્રોત લિંક સાથે આપેલા છે.",
      "અમારા શબ્દોમાં: સમાચાર અમે અમારા શબ્દોમાં લખીએ છીએ; બીજા માધ્યમોનું લખાણ કે ફોટા લેતા નથી. ફોટા ફક્ત સરકારી સ્રોતના છે અને તેનો સ્રોત લખેલો છે.",
      "સંવેદનશીલ સમાચાર: મૃત્યુ, અકસ્માત, ગુના કે કોઈ વ્યક્તિ સામેના આક્ષેપો જેવા સમાચાર માત્ર સ્રોતોમાં જે કહેવાયું હોય તે જ જણાવે છે, અને તેની સાથે જૂના ફોટા મુકાતા નથી.",
      "જાહેરાત અને સમાચાર અલગ: પૈસા લઈને સમાચાર છાપવામાં આવતા નથી. જાહેરાત હંમેશાં જાહેરાત તરીકે ઓળખાશે.",
    ] },
    en: { title: "Editorial policy", paras: [
      "Sources: our stories come from official sources (the Press Information Bureau – PIB, ministries, the Reserve Bank, the Gujarat government, foreign governments and international bodies) and from established, trusted news outlets. Every story ends with all its sources and links.",
      "In our own words: we write stories in our own words and never take other outlets’ text or photos. Photos come only from government sources and say so.",
      "Sensitive stories: deaths, accidents, crime and allegations against named people say only what the sources say, and carry no file photos.",
      "News is not for sale: we do not publish news for payment. Advertising is always marked as advertising.",
    ] },
    hi: { title: "संपादकीय नीति", paras: [
      "स्रोत: हमारे समाचार आधिकारिक स्रोतों (पत्र सूचना कार्यालय – PIB, मंत्रालय, रिज़र्व बैंक, गुजरात सरकार, विदेशी सरकारें और अंतरराष्ट्रीय संस्थाएँ) और जाने-माने, भरोसेमंद समाचार माध्यमों से हैं। हर समाचार के अंत में उसके सभी स्रोत लिंक के साथ दिए गए हैं।",
      "अपने शब्दों में: हम समाचार अपने शब्दों में लिखते हैं; दूसरे माध्यमों का लेख या फ़ोटो नहीं लेते। फ़ोटो केवल सरकारी स्रोतों के हैं और उनका स्रोत लिखा होता है।",
      "संवेदनशील समाचार: मृत्यु, दुर्घटना, अपराध या किसी व्यक्ति पर आरोप जैसे समाचार वही बताते हैं जो स्रोतों में कहा गया है, और उनके साथ पुरानी तस्वीरें नहीं लगाई जातीं।",
      "समाचार बिकाऊ नहीं: पैसे लेकर समाचार नहीं छापे जाते। विज्ञापन हमेशा विज्ञापन के रूप में पहचाना जाएगा।",
    ] },
  },
  "how-we-check": {
    gu: { title: "અમે સમાચાર કેવી રીતે ચકાસીએ છીએ", paras: [
      "કોણે કહ્યું: સરકાર કે સત્તાવાર સંસ્થા પોતે જાહેર કરે તે સમાચાર જ એકલા સ્રોત પર પ્રકાશિત થાય છે. કોઈ માધ્યમના સમાચાર માટે ઓછામાં ઓછાં બે સ્વતંત્ર માધ્યમો (અલગ માલિકીનાં) એક જ વાત કહે ત્યારે જ તે પ્રકાશિત થાય છે.",
      "તાજા અને સાચા: જૂના સમાચાર ફરી ફરતા હોય તો પકડાય છે. ફેક્ટ-ચેક સંસ્થાઓએ (જેમ કે PIB ફેક્ટ ચેક) ખોટા જાહેર કરેલા દાવા પ્રકાશિત થતા નથી.",
      "દરેક દાવો અને આંકડો: સમાચારનો દરેક દાવો અને દરેક આંકડો (રકમ, તારીખ, સંખ્યા) મૂળ સ્રોત સાથે મેળવાય છે; લખનાર સિવાયની બીજી તપાસ પણ દરેક દાવો ફરી તપાસે છે. મેળ ન ખાય તો સમાચાર પ્રકાશિત થતા નથી.",
      "અનુવાદ: અંગ્રેજી અને હિંદી અનુવાદના આંકડા પણ ગુજરાતી સમાચાર સાથે મેળવાય છે. મેળ ન ખાય તો ગુજરાતી સમાચાર જ બતાવાય છે.",
      "પ્રકાશન પછી પણ: સ્રોત પોતાના સમાચાર સુધારે કે પાછા ખેંચે તો અમારા સમાચાર પણ તરત રોકાય છે અને સુધારાય છે. દરેક સમાચારના અંતે મૂળ સ્રોતની લિંક હોય છે, જેથી વાચક જાતે મેળવી શકે.",
    ] },
    en: { title: "How we check the news", paras: [
      "Who said it: only a government or official body speaking for itself is published on its own. A report from a news outlet is published only when at least two independent outlets (with different owners) say the same.",
      "Fresh and true: old news going round again is caught. Claims that fact-checkers (such as PIB Fact Check) have found false are not published.",
      "Every claim and number: each claim and each number in a story (amounts, dates, counts) is matched against the original sources, and a second check, separate from the writing, goes over every claim again. If anything doesn’t match, the story isn’t published.",
      "Translations: the numbers in each English and Hindi version are matched against the Gujarati story too. If they don’t match, the Gujarati story is shown instead.",
      "After publishing too: if a source corrects or withdraws its report, our story is held and corrected at once. Every story ends with links to its original sources, so readers can check it themselves.",
    ] },
    hi: { title: "हम समाचार कैसे जाँचते हैं", paras: [
      "किसने कहा: केवल सरकार या आधिकारिक संस्था के अपने बयान ही एक स्रोत पर प्रकाशित होते हैं। किसी समाचार माध्यम की ख़बर तभी प्रकाशित होती है जब कम से कम दो स्वतंत्र माध्यम (अलग मालिकों वाले) एक ही बात कहें।",
      "ताज़ा और सच: पुराने समाचार फिर से फैलें तो पकड़े जाते हैं। फ़ैक्ट-चेक संस्थाओं (जैसे PIB फ़ैक्ट चेक) ने जिन दावों को ग़लत बताया है, वे प्रकाशित नहीं होते।",
      "हर दावा और आँकड़ा: समाचार का हर दावा और हर आँकड़ा (रक़म, तारीख़, संख्या) मूल स्रोतों से मिलाया जाता है, और लिखने से अलग एक दूसरी जाँच हर दावे को फिर परखती है। मेल न खाए तो समाचार प्रकाशित नहीं होता।",
      "अनुवाद: अंग्रेज़ी और हिंदी संस्करणों के आँकड़े भी गुजराती समाचार से मिलाए जाते हैं। मेल न खाए तो गुजराती समाचार ही दिखाया जाता है।",
      "प्रकाशन के बाद भी: स्रोत अपनी ख़बर सुधारे या वापस ले, तो हमारा समाचार तुरंत रोका और सुधारा जाता है। हर समाचार के अंत में मूल स्रोतों की लिंक होती है, ताकि पाठक ख़ुद जाँच सकें।",
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
    hi: { title: "सुधार", paras: [
      "ग़लती होने पर हम उसे खुलकर सुधारते हैं। सुधारे गए समाचार के ऊपर तारीख़ के साथ लिखा जाता है कि क्या बदला। चुपचाप बदलाव नहीं किया जाता।",
      "कोई ग़लती दिखे तो समाचार के अंत में “कोई ग़लती दिखी? हमें बताएँ” दबाएँ, या हमें लिखें: " + PAPER.email + "।",
    ] },
  },
  contact: {
    gu: { title: "સંપર્ક", paras: [contact("gu"), "સમાચાર, ભૂલ, જાહેરાત કે અન્ય કોઈ બાબત માટે ઈમેલ કરો. અમે જલદી જવાબ આપીશું."] },
    en: { title: "Contact", paras: [contact("en"), "Email us about news, a mistake, advertising or anything else. We’ll reply as soon as we can."] },
    hi: { title: "संपर्क", paras: [contact("hi"), "समाचार, ग़लती, विज्ञापन या किसी और बात के लिए ईमेल करें। हम जल्द जवाब देंगे।"] },
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
    hi: { title: "उपयोग के नियम", paras: [
      "इस वेबसाइट के समाचार, फ़ोटो और ई-पेपर कैपिटल क्रांति के हैं (सरकारी स्रोतों के फ़ोटो उनके स्रोतों के)। निजी पढ़ने के लिए उपयोग करें; समाचारों की लिंक भेजने का स्वागत है।",
      "पूरे समाचार या ई-पेपर कहीं और फिर से प्रकाशित करने हों तो पहले हमारी लिखित अनुमति लें।",
      "हम हर समाचार सही रखने की पूरी कोशिश करते हैं; ग़लती दिखे तो बताएँ, हम सुधारेंगे।",
    ] },
  },
  privacy: {
    gu: { title: "ગોપનીયતા", paras: [
      "આ વેબસાઇટ વાંચવા માટે ખાતું કે સાઇન-ઇન જરૂરી નથી. અમે તમારી માહિતી વેચતા નથી અને જાહેરાત માટે તમને ટ્રૅક કરતા નથી.",
      "તમારો દેખાવ (લાઇટ/ડાર્ક), અક્ષરનું કદ અને સાચવેલા સમાચાર ફક્ત તમારા પોતાના બ્રાઉઝરમાં રહે છે; અમારી પાસે આવતા નથી.",
      "\"સૌથી વધુ વંચાયેલા\" યાદી માટે અમે ફક્ત ગણીએ છીએ કે દરેક સમાચાર કેટલી વાર ખૂલ્યા; કોણે ખોલ્યા તે નહીં. તમારા બ્રાઉઝરમાં ફક્ત એટલું યાદ રહે છે કે કયા સમાચાર ગણાઈ ગયા, જેથી એક જ વ્યક્તિ બે વાર ન ગણાય.",
      "વેબસાઇટ ચલાવતી સેવા (Vercel) સુરક્ષા માટે થોડા સમય માટે સામાન્ય ટેકનિકલ લૉગ રાખે છે.",
      "પ્રશ્ન હોય તો લખો: " + PAPER.email + ".",
    ] },
    en: { title: "Privacy", paras: [
      "You don’t need an account or sign-in to read this website. We don’t sell your information and don’t track you for advertising.",
      "Your appearance (light or dark), text size and saved stories stay in your own browser only; they never reach us.",
      "For the \"most read\" list we only count how many times each story is opened, never who opened it. Your browser remembers which stories it has already counted, so one reader isn’t counted twice.",
      "The service that runs the website (Vercel) keeps ordinary technical logs for a short time, for security.",
      "Questions? Write to " + PAPER.email + ".",
    ] },
    hi: { title: "गोपनीयता", paras: [
      "इस वेबसाइट को पढ़ने के लिए खाता या साइन-इन ज़रूरी नहीं है। हम आपकी जानकारी नहीं बेचते और विज्ञापन के लिए आपको ट्रैक नहीं करते।",
      "आपका रूप (लाइट/डार्क), अक्षर का आकार और सहेजे गए समाचार केवल आपके अपने ब्राउज़र में रहते हैं; हम तक नहीं आते।",
      "\"सबसे ज़्यादा पढ़े गए\" सूची के लिए हम केवल गिनते हैं कि हर समाचार कितनी बार खुला; किसने खोला, यह नहीं। आपका ब्राउज़र बस यह याद रखता है कि कौन-से समाचार गिने जा चुके, ताकि एक पाठक दो बार न गिना जाए।",
      "वेबसाइट चलाने वाली सेवा (Vercel) सुरक्षा के लिए थोड़े समय तक सामान्य तकनीकी लॉग रखती है।",
      "कोई प्रश्न? लिखें: " + PAPER.email + "।",
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
