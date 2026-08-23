// Real masthead/edition/footer chrome, transcribed from "(196) Capital Kranti_08 august.pdf"
// (its body text is legacy Bharati-encoded and unreadable -- see gridSpec.ts notes -- but the
// masthead/contact/edition-bar/footer lines are plain, factual, and were read directly off the
// rendered page). Two real news items below are original Gujarati summaries of current PIB
// Ahmedabad press releases (Aug 2026, Gandhinagar), written from the facts in each release --
// not machine-translated or quoted at length. Sources noted per item.

export const CHROME = {
  tagline: "સમાજનો વિવેકપૂર્ણ દ્રષ્ટિકોણ",
  wordmark: "કેપિટલ ક્રાંતિ",
  subtitle: "દૈનિક (ગાંધીનગર)",
  contactBar: "M. : 98256 08744    •    E-mail : capitalkranti@gmail.com    •    web : capitalkranti.co.in",
  rni: "RNI No. 54922/93",
  footerLegal:
    "OWNER, PRINTER, PUBLISHER AND EDITOR : PARTH M. THAKKAR, PRINTED AT ANUGRAH COMPUTERS & PRINTERS, " +
    "PLOT NO. 704/B/2, G.I.D.C., SECTOR-28, GANDHINAGAR. PUBLISHED FROM : BLOCK NO. 32/4, GH TYPE, " +
    "SECTOR-28, GANDHINAGAR [GUJARAT]-382 028.",
};

/** Dynamic per-issue fields -- these are the ones an automated build should regenerate daily,
 * everything in CHROME above stays fixed across issues. */
export function editionBar(date: Date, issueNo: number): string {
  const days = ["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"];
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const dow = days[date.getDay()];
  return (
    `વર્ષ : 34    •    અંક : ${issueNo}    •    તારીખ : ${dd}-${mm}-${yyyy}, ${dow}` +
    `    •    કિંમત : 50 પૈસા    •    તંત્રી : પાર્થ એમ. ઠક્કર` +
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

const today = new Date();

/** Frame-id -> text, for the frames on page 1 we have real content for.
 * Anything not listed here (photo frames, ad/box backgrounds, and the third
 * headline slot the original page has room for) renders as a clearly-marked
 * placeholder in the print route -- not fabricated as if it were real news. */
export const PAGE1_CONTENT: Record<string, string> = {
  "p1-2": CHROME.tagline,
  "p1-4": `${CHROME.contactBar}    ${CHROME.rni}`,
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
};

// Explicitly a placeholder, not a third real story -- see the roadmap's stance on
// never auto-filling editorial space with fabricated content.
export const OPEN_STORY_SLOT_IDS = ["p1-25", "p1-26", "p1-27", "p1-28", "p1-29"];

export const PAGE4_FOOTER_ID = "p4-footer-legal";

// The source PDF's wordmark used a condensed custom display face at 190pt; Noto Sans
// Gujarati (the dev-preview stand-in font) is noticeably wider, so it's rendered here
// at a size that actually fits the same frame rather than overflowing it. This is a
// display-only override, not evidence the auto-fit problem is solved -- headline and
// body frames below still render at their measured native size, overflow and all.
export const FONT_SIZE_OVERRIDES_PT: Record<string, number> = {
  "p1-7": 68,
};
