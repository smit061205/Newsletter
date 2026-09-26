// Real masthead/edition/footer chrome, transcribed directly from
// "(196) Capital Kranti_08 august.pdf" -- the masthead/contact/edition-bar/
// footer lines are plain, factual, and were read directly off the rendered
// page. This is everything that stays FIXED across issues; it survives the
// move to a backend-driven article model (see docs/FRONTEND_ROADMAP.md) --
// the backend owns which articles exist and their content, this file owns
// the newspaper's own static identity, which is a frontend/design concern
// independent of any CMS.
//
// Split out of the old content.ts (now archive/legacy-pipeline/) when that
// file's other exports (Story interface, STORY_* stubs, PAGE1_CONTENT) were
// retired as superseded by the incoming backend contract -- this part was
// never day-specific and had nothing to do with the old per-frame model.

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
