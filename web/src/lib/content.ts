// Real masthead/edition/footer chrome, transcribed from "(196) Capital Kranti_08 august.pdf"
// (its body text is legacy Bharati-encoded and unreadable -- see gridSpec.ts notes -- but the
// masthead/contact/edition-bar/footer lines are plain, factual, and were read directly off the
// rendered page). Two real news items below are original Gujarati summaries of current PIB
// Ahmedabad press releases (Aug 2026, Gandhinagar), written from the facts in each release --
// not machine-translated or quoted at length. Sources noted per item.

export const CHROME = {
  tagline: "સમાજનો વિવેકપૂર્ણ દ્રષ્ટિકોણ",
  wordmark: "કેપિટલ ક્રાંતિ",
  subtitleEn: "(CAPITAL KRANTI - DAILY - GANDHINAGAR)",
  subtitle: "દૈનિક (ગાંધીનગર)",
  contactBar: "M. : 98256 08744    •    E-mail : capitalkranti@gmail.com    •    web : capitalkranti.co.in",
  rni: "RNI No. 54922/93",
  footerLegal:
    "OWNER, PRINTER, PUBLISHER AND EDITOR : PARTH M. THAKKAR, PRINTED AT ANUGRAH COMPUTERS & PRINTERS, " +
    "PLOT NO. 704/B/2, G.I.D.C., SECTOR-28, GANDHINAGAR. PUBLISHED FROM : BLOCK NO. 32/4, GH TYPE, " +
    "SECTOR-28, GANDHINAGAR [GUJARAT]-382 028.",
};

// The source page sets all numerals in the edition bar as Gujarati digits (૦-૯),
// not Latin -- these are the ones that actually appear in the original render.
const GUJARATI_DIGITS = ["૦", "૧", "૨", "૩", "૪", "૫", "૬", "૭", "૮", "૯"];
function toGujaratiDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => GUJARATI_DIGITS[Number(d)]);
}

/** Dynamic per-issue fields -- these are the ones an automated build should regenerate daily,
 * everything in CHROME above stays fixed across issues. */
export function editionBar(date: Date, issueNo: number): string {
  const days = ["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"];
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const dow = days[date.getDay()];
  return (
    `વર્ષ : ${toGujaratiDigits(34)}    •    અંક : ${toGujaratiDigits(issueNo)}    •    ` +
    `તારીખ : ${toGujaratiDigits(`${dd}-${mm}-${yyyy}`)}, ${dow}` +
    `    •    કિંમત : ${toGujaratiDigits(50)} પૈસા    •    તંત્રી : પાર્થ એમ. ઠક્કર` +
    `    •    બ્યુરો ચીફ : બિજેન કાપડિયા (અમદાવાદ)    •    મેનેજિંગ તંત્રી : સુરેશ ચંડી`
  );
}

export interface Story {
  kicker?: string;
  headline: string;
  subhead?: string;
  bodyColumns: string[]; // pre-split so each column frame gets its own chunk
  source: string;
}

// Source: PIB Ahmedabad, "IIT Gandhinagar Brings Academic Institutions Together to Shape..."
// (SAMARTH pre-launch), 10 Aug 2026. https://www.pib.gov.in/PressReleasePage.aspx?PRID=2297007
export const STORY_SAMARTH: Story = {
  kicker: "₹190 કરોડનો પ્રોજેક્ટ, પાંચ વર્ષમાં 10 હજારથી વધુ વિદ્યાર્થીઓને તાલીમ અપાશે",
  headline: "IITGNમાં સેમિકન્ડક્ટર તાલીમ હબ 'સામર્થ્ય'નો પ્રારંભ",
  bodyColumns: [
    "ગાંધીનગર: IIT ગાંધીનગર ખાતે શનિવારે 'સામર્થ્ય' (સિલિકોન એન્ડ એડવાન્સ્ડ સેમિકન્ડક્ટર " +
      "મેન્યુફેક્ચરિંગ રિસર્ચ એન્ડ ટ્રેનિંગ હબ) પ્રોજેક્ટની પૂર્વ-શુભારંભ બેઠક યોજાઈ હતી.",
    "ગુજરાતની વિવિધ યુનિવર્સિટીઓ અને એન્જિનિયરિંગ સંસ્થાઓના પ્રતિનિધિઓએ બેઠકમાં ભાગ લઈ " +
      "અભ્યાસક્રમ, તાલીમ અને સંશોધન સહયોગ અંગે પોતાના મંતવ્યો રજૂ કર્યા હતા.",
    "ઇલેક્ટ્રોનિક્સ અને ઇન્ફોર્મેશન ટેકનોલોજી મંત્રાલય, ગુજરાત સરકાર અને IITGN ના સંયુક્ત આ " +
      "પ્રોજેક્ટ હેઠળ આગામી પાંચ વર્ષમાં 10,000થી વધુ વિદ્યાર્થીઓ-ટેકનિશિયનોને તાલીમ તેમજ " +
      "1,000થી વધુ ઉદ્યોગ વ્યાવસાયિકોને અપસ્કિલ કરાશે.",
    "સંસ્થાના ડિરેક્ટર પ્રો. રજત મૂનાએ જણાવ્યું કે સેમિકન્ડક્ટર ક્ષેત્રે કુશળ માનવબળ તૈયાર " +
      "કરવું એ ભારતની સ્પર્ધાત્મકતા માટે અનિવાર્ય છે.",
  ],
  source: "PIB Ahmedabad, 10 Aug 2026 (PRID 2297007)",
};

// Source: PIB Ahmedabad, "IIT Gandhinagar Launches PRAG Initiative, Experts Discuss
// Technology's Role in Governance", 12 Aug 2026.
// https://www.pib.gov.in/PressReleasePage.aspx?PRID=2298380
export const STORY_PRAG: Story = {
  subhead: "ટેકનોલોજી અને શાસનના સંગમ પર નિષ્ણાતોની ચર્ચા, ભૂતપૂર્વ મુખ્ય સચિવો પણ જોડાયા",
  headline: "IIT ગાંધીનગર દ્વારા નીતિ-સંશોધન માટે 'પ્રાગ' પહેલનો પ્રારંભ",
  bodyColumns: [
    "ગાંધીનગર: IIT ગાંધીનગરે 11 ઓગસ્ટના રોજ 'પ્રાગ' (પોલિસી રિસર્ચ એન્ડ એનાલિટિક્સ ફોર " +
      "ગવર્નન્સ) પહેલનો પ્રારંભ કર્યો, જે ટેકનોલોજી, જાહેર નીતિ અને શાસનને એક મંચ પર લાવવાનો પ્રયાસ છે.",
    "સંસ્થાના ફાઉન્ડેશન કાર્યક્રમ અંતર્ગત યોજાયેલ આ પ્રસંગે 'જાહેર નીતિમાં ટેકનોલોજી સંસ્થાઓની " +
      "ભૂમિકા' વિષય પર પેનલ ચર્ચા યોજાઈ હતી.",
    "ગુજરાત સરકારના ભૂતપૂર્વ મુખ્ય સચિવ શ્રી રાજ કુમાર અને ભૂતપૂર્વ અધિક મુખ્ય સચિવ શ્રી " +
      "જે.પી. ગુપ્તા સહિત અનેક નિષ્ણાતોએ ચર્ચામાં ભાગ લીધો હતો.",
    "પ્રો. પ્રહર્ષ એમ. પટેલ અને પ્રો. દીપક સિંઘાનિયા આ પહેલનું સંકલન કરી રહ્યા છે.",
  ],
  source: "PIB Ahmedabad, 12 Aug 2026 (PRID 2298380)",
};

// Source: PIB Ahmedabad, "NIFT Gandhinagar Launches 24-Hour Uniform Design Hackathon",
// 29 May 2026. https://www.pib.gov.in/PressReleasePage.aspx?PRID=2266804
export const STORY_NIFT: Story = {
  subhead: "ITI તાલીમાર્થીઓ માટે નવો યુનિફોર્મ, વિજેતા ટીમને ₹1 લાખનું ઇનામ",
  headline: "NIFT ગાંધીનગર ખાતે 24 કલાકની યુનિફોર્મ ડિઝાઇન હેકાથોન",
  bodyColumns: [
    "ગાંધીનગર: NIFT ગાંધીનગર અને ગુજરાત સરકારના રોજગાર અને તાલીમ નિયામકની કચેરીના સંયુક્ત " +
      "ઉપક્રમે 'યુનિફોર્મ ડિઝાઇન હેકાથોન 2026'નો પ્રારંભ NIFT કેમ્પસ ખાતે થયો હતો.",
    "NIFT ગાંધીનગર અને ગુજરાત યુનિવર્સિટીની કુલ ચાર વિદ્યાર્થી ટીમો રાજ્યની સરકારી ITI " +
      "સંસ્થાઓ માટે કાર્યક્ષમ અને પોસાય તેવા યુનિફોર્મ ડિઝાઇન કરવા 24 કલાક સતત કામ કરી રહી છે.",
    "વિજેતા ડિઝાઇનનો ખર્ચ પ્રતિ યુનિફોર્મ ₹1,000થી વધુ ન હોવો જોઈએ. પ્રથમ ટીમને ₹50,000, " +
      "બીજીને ₹30,000 અને ત્રીજીને ₹20,000નું ઇનામ અપાશે.",
  ],
  source: "PIB Ahmedabad, 29 May 2026 (PRID 2266804)",
};

// Source: PIB Delhi, "PM to Visit Gujarat on 25-26 August", 24 Aug 2025. Dated a year
// before this demo's "today" -- included anyway as a realistic example of a longer
// policy/visit backgrounder a paper runs ahead of the event, date kept accurate rather
// than implied to be this week's news. https://www.pib.gov.in/PressReleasePage.aspx?PRID=2160280
export const STORY_PM_VISIT: Story = {
  kicker: "25-26 ઓગસ્ટે અમદાવાદમાં ₹5,400 કરોડના વિકાસ પ્રોજેક્ટ્સનું લોકાર્પણ",
  headline: "વડાપ્રધાન મોદી 25-26 ઓગસ્ટે ગુજરાતની મુલાકાતે",
  bodyColumns: [
    "અમદાવાદ: વડાપ્રધાન નરેન્દ્ર મોદી 25-26 ઓગસ્ટના રોજ ગુજરાતની મુલાકાતે આવશે. તેઓ 25 " +
      "ઓગસ્ટે સાંજે ખોડલધામ મેદાન, અમદાવાદ ખાતે ₹5,400 કરોડથી વધુના વિવિધ વિકાસ પ્રોજેક્ટ્સનું " +
      "લોકાર્પણ અને શિલાન્યાસ કરશે.",
    "26 ઓગસ્ટે તેઓ હાંસલપુર ખાતે સુઝુકીની પ્રથમ ગ્લોબલ બેટરી ઇલેક્ટ્રિક વ્હીકલ 'e VITARA'ને " +
      "100થી વધુ દેશોમાં નિકાસ માટે લીલી ઝંડી આપશે તેમજ હાઇબ્રિડ બેટરી ઇલેક્ટ્રોડના સ્થાનિક " +
      "ઉત્પાદનનું ઉદ્ઘાટન કરશે.",
    "કાર્યક્રમમાં ₹1,400 કરોડથી વધુના રેલવે પ્રોજેક્ટ્સ પણ રાષ્ટ્રને અર્પણ કરાશે, જેમાં " +
      "મહેસાણા-પાલનપુર રેલ લાઇનનું બમણું કરણ અને કલોલ-કડી-કટોસણ તથા બેચરાજી-રાણુજ લાઇનનું " +
      "ગેજ પરિવર્તન સામેલ છે.",
    "વિરમગામ-ખુડદ-રામપુરા રોડના પહોળાઈકરણનું ઉદ્ઘાટન તેમજ અમદાવાદ નજીક છ-લેન અંડરપાસના " +
      "નિર્માણનું ખાતમુહૂર્ત પણ કરાશે.",
  ],
  source: "PIB Delhi, 24 Aug 2025 (PRID 2160280)",
};

const today = new Date();

/** Frame-id -> text, for the frames on page 1 we have real content for. */
export const PAGE1_CONTENT: Record<string, string> = {
  "p1-2": CHROME.tagline,
  "p1-4": CHROME.contactBar,
  "p1-7": CHROME.wordmark,
  "p1-8": CHROME.subtitle,
  "p1-10": editionBar(today, 212),

  "p1-11": STORY_SAMARTH.kicker ?? "",
  "p1-13": STORY_SAMARTH.headline,
  "p1-14": STORY_SAMARTH.bodyColumns[0],
  "p1-17": STORY_SAMARTH.bodyColumns[1],
  "p1-18": STORY_SAMARTH.bodyColumns[2],
  "p1-19": STORY_SAMARTH.bodyColumns[3],

  "p1-12": STORY_PRAG.headline,
  "p1-21": STORY_PRAG.subhead ?? "",
  "p1-20": STORY_PRAG.bodyColumns[0],
  "p1-22": STORY_PRAG.bodyColumns[1],
  "p1-23": STORY_PRAG.bodyColumns[2],
  "p1-24": STORY_PRAG.bodyColumns[3],

  "p1-25": STORY_NIFT.headline,
  "p1-28": STORY_NIFT.subhead ?? "",
  "p1-35": STORY_NIFT.bodyColumns[0],
  "p1-36": STORY_NIFT.bodyColumns[1],
  "p1-37": STORY_NIFT.bodyColumns[2],

  "p1-26": STORY_PM_VISIT.kicker ?? "",
  "p1-27": STORY_PM_VISIT.headline,
  "p1-29": STORY_PM_VISIT.bodyColumns[0],
  "p1-31": STORY_PM_VISIT.bodyColumns[1],
  "p1-32": STORY_PM_VISIT.bodyColumns[2],
  "p1-33": STORY_PM_VISIT.bodyColumns[3],
};

// Structurally ad space in the original (bordered boxes with no editorial text
// nearby) -- labelled as what they are rather than left blank or faked as news.
export const AD_PLACEHOLDER_IDS = ["p1-39", "p1-40"];

// The two small bottom-of-page brief slots with no sourced content behind them yet.
export const OPEN_STORY_SLOT_IDS = ["p1-42", "p1-43"];

export const PAGE4_FOOTER_ID = "p4-footer-legal";

// The source PDF's wordmark used a condensed custom display face at 190pt; Noto Sans
// Gujarati (the dev-preview stand-in font) is noticeably wider, so it's rendered here
// at a size that actually fits the same frame rather than overflowing it. This is a
// display-only override, not evidence the auto-fit problem is solved -- headline and
// body frames below still render at their measured native size, overflow and all.
export const FONT_SIZE_OVERRIDES_PT: Record<string, number> = {
  "p1-7": 68,
};
