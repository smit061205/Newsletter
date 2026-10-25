// The site's own words, Gujarati first (docs/website/DESIGN.md §5). Stories
// carry their own English (made by the hourly run); these are the labels.
import type { Lang } from "./types.ts";

const WORDS = {
  gu: {
    skip: "મુખ્ય સમાચાર પર જાઓ", menu: "મેનુ", sections: "વિભાગો", search: "શોધો", close: "બંધ કરો", epaper: "ઈ-પેપર",
    home: "હોમ", latest: "તાજા", latestTitle: "તાજા સમાચાર", allLatest: "બધા તાજા સમાચાર", archive: "જૂના અંકો",
    updated: "દિવસભર નવા સમાચાર", more: "વધુ", none: "આ વિભાગમાં હજી સમાચાર નથી.", back: "હોમ પર જાઓ",
    searchPlaceholder: "સમાચાર શોધો", found: "સમાચાર મળ્યા", notFound: "કોઈ સમાચાર ન મળ્યા. બીજો શબ્દ અજમાવો.", searchTitle: "શોધ",
    settings: "સેટિંગ્સ", theme: "દેખાવ", themeAuto: "ફોન પ્રમાણે", light: "લાઇટ", dark: "ડાર્ક", size: "અક્ષરનું કદ", language: "ભાષા",
    services: "અમારી સેવાઓ", about: "અમારા વિશે",
    share: "WhatsApp પર મોકલો", shareShort: "મોકલો", copy: "લિંક કૉપી કરો", copied: "લિંક કૉપી થઈ", save: "સાચવો", saved: "સાચવ્યું",
    savedToast: "સમાચાર સાચવ્યા", unsavedToast: "સાચવેલામાંથી કાઢ્યા", savedTitle: "સાચવેલા સમાચાર", noneSaved: "હજી કોઈ સમાચાર સાચવ્યા નથી. સમાચારમાં “સાચવો” દબાવો.",
    published: "પ્રકાશિત", updatedAt: "સુધારેલ", desk: "કેપિટલ ક્રાંતિ ડેસ્ક", by: "લેખક", min: "મિનિટનું વાંચન",
    checked: "આંકડા મૂળ સ્રોત સાથે ચકાસેલા", srcTitle: "આ સમાચારનો સ્રોત", how: "દરેક આંકડો મૂળ સ્રોત સાથે મેળવ્યો છે.",
    report: "ભૂલ દેખાય? અમને જણાવો", reportBody: "આ સમાચારમાં ભૂલ:", correction: "સુધારો", related: "આ વિભાગમાંથી વધુ", photo: "ફોટો",
    epTitle: "આજનું છાપેલું પેપર", epRead: "આજનું ઈ-પેપર વાંચો", page: "પાનું", pdf: "PDF ડાઉનલોડ", epNote: "પાનું દબાવો એટલે મોટું ખૂલશે.",
    issue: "અંક", storiesCount: "સમાચાર", noEpaper: "હજી કોઈ ઈ-પેપર મુકાયું નથી.",
    joinTitle: "કેપિટલ ક્રાંતિ WhatsApp પર", joinText: "રોજ સાંજે દિવસના મુખ્ય સમાચાર અને ઈ-પેપર, સીધા તમારા ફોનમાં.", joinSoon: "ચેનલ ટૂંક સમયમાં",
    noEnglish: "", topics: "વિષયો",
    f1: "કેપિટલ ક્રાંતિ", f2: "વિભાગો", f3: "મેળવો", f4: "નિયમો", fAbout: "અમારા વિશે", fPolicy: "સંપાદકીય નીતિ", fHow: "અમે સમાચાર કેવી રીતે ચકાસીએ છીએ",
    fFix: "સુધારા", fContact: "સંપર્ક", fTerms: "ઉપયોગના નિયમો", fPrivacy: "ગોપનીયતા", fRss: "RSS",
    empty: "હજી સમાચાર મુકાયા નથી. આજે સાંજે ફરી જુઓ.", notFoundTitle: "આ પાનું મળ્યું નહીં", notFoundText: "આ સમાચાર કે પાનું અહીં નથી. હોમ પરથી શોધો.",
  },
  en: {
    skip: "Skip to the news", menu: "Menu", sections: "Sections", search: "Search", close: "Close", epaper: "E-paper",
    home: "Home", latest: "Latest", latestTitle: "Latest news", allLatest: "All the latest", archive: "Past issues",
    updated: "News all day", more: "More", none: "No stories in this section yet.", back: "Go to the home page",
    searchPlaceholder: "Search the news", found: "stories found", notFound: "No stories found. Try another word.", searchTitle: "Search",
    settings: "Settings", theme: "Appearance", themeAuto: "Match phone", light: "Light", dark: "Dark", size: "Text size", language: "Language",
    services: "Our services", about: "About us",
    share: "Send on WhatsApp", shareShort: "Send", copy: "Copy link", copied: "Link copied", save: "Save", saved: "Saved",
    savedToast: "Story saved", unsavedToast: "Removed from saved", savedTitle: "Saved stories", noneSaved: "No saved stories yet. Press “Save” on a story.",
    published: "Published", updatedAt: "Updated", desk: "Capital Kranti desk", by: "By", min: "min read",
    checked: "Numbers checked against the original source", srcTitle: "Where this story comes from", how: "Every number was matched against the original source.",
    report: "Spotted a mistake? Tell us", reportBody: "A mistake in this story:", correction: "Correction", related: "More from this section", photo: "Photo",
    epTitle: "Today’s printed paper", epRead: "Read today’s e-paper", page: "Page", pdf: "Download PDF", epNote: "Tap a page to open it full size.",
    issue: "Issue", storiesCount: "stories", noEpaper: "No e-paper has been put up yet.",
    joinTitle: "Capital Kranti on WhatsApp", joinText: "The day’s main news and the e-paper every evening, straight to your phone.", joinSoon: "Channel coming soon",
    noEnglish: "This story’s English version isn’t ready yet, so it is shown in Gujarati.", topics: "Topics",
    f1: "Capital Kranti", f2: "Sections", f3: "Get it", f4: "Policies", fAbout: "About us", fPolicy: "Editorial policy", fHow: "How we check the news",
    fFix: "Corrections", fContact: "Contact", fTerms: "Terms of use", fPrivacy: "Privacy", fRss: "RSS",
    empty: "No stories yet. Look again this evening.", notFoundTitle: "Page not found", notFoundText: "This story or page isn’t here. Try the home page.",
  },
} as const;

export type WordKey = keyof (typeof WORDS)["gu"];
export const t = (lang: Lang, key: WordKey): string => WORDS[lang][key];

/** A path in the reader's language: Gujarati at the root, English under /en. */
export const href = (lang: Lang, path: string) => (lang === "en" ? (path === "/" ? "/en" : `/en${path}`) : path);
/** The same page in the other language. */
export const otherLang = (lang: Lang): Lang => (lang === "gu" ? "en" : "gu");
