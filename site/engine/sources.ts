// The sources the engine watches (ROADMAP §2, decided 25 Oct): India in depth
// (every central ministry through PIB, the Gujarat government, regulators,
// the public broadcasters), the main offices of ~30 countries and the world
// bodies, trusted outlets (Gujarati, Indian, world), and fact-checkers.
//
// Only sources listed here are ever used; nothing found elsewhere counts.
// Every source is read as it offers itself to programs: its RSS/Atom feed, or
// PIB's list pages (as the app reads them). A source that refuses us (401,
// 403, 451, or robots.txt says no) is switched off and reported, never worked
// around. `site/engine/probe.ts` checks the whole list from GitHub's servers.
//
// trust:  "official" -- confirmed on its own (a government speaking for itself)
//         "outlet"   -- needs a second, independent outlet (a different group)
//         "factcheck"-- read only for debunked claims (§3.1 step 6)
// group:  who owns it: two outlets of one group are one voice
// tier:   where its news usually belongs (the triage decides each item)

export type Trust = "official" | "outlet" | "factcheck";
export type SourceLang = "gu" | "hi" | "en";
export interface SourceDef {
  id: string;
  name: string;
  /** a feed (RSS or Atom), or "pib:gu" / "pib:hi" / "pib:en" for PIB's lists */
  url: string;
  trust: Trust;
  group: string;
  lang: SourceLang;
  tier: "gujarat" | "india" | "world";
  /** the hosts its own items live on (an item linking elsewhere isn't its own) */
  hosts: string[];
}

const o = (id: string, name: string, url: string, lang: SourceLang, tier: SourceDef["tier"], hosts: string[], group = id): SourceDef =>
  ({ id, name, url, trust: "official", group, lang, tier, hosts });
const n = (id: string, name: string, url: string, lang: SourceLang, tier: SourceDef["tier"], hosts: string[], group: string): SourceDef =>
  ({ id, name, url, trust: "outlet", group, lang, tier, hosts });
const f = (id: string, name: string, url: string, lang: SourceLang, hosts: string[]): SourceDef =>
  ({ id, name, url, trust: "factcheck", group: id, lang, tier: "india", hosts });

const GOVUK = ["www.gov.uk", "gov.uk"];
const govuk = (id: string, name: string, org: string) => o(id, name, `https://www.gov.uk/government/organisations/${org}.atom`, "en", "world", GOVUK, "uk-gov");

export const SOURCES: SourceDef[] = [
  // ---- India: the central government (every ministry speaks through PIB) ----
  o("pib-gu", "PIB અમદાવાદ", "pib:gu", "gu", "gujarat", ["pib.gov.in", "www.pib.gov.in"], "pib"),
  o("pib-en", "PIB Delhi", "pib:en", "en", "india", ["pib.gov.in", "www.pib.gov.in"], "pib"),
  o("pib-hi", "PIB दिल्ली", "pib:hi", "hi", "india", ["pib.gov.in", "www.pib.gov.in"], "pib"),
  o("rbi", "Reserve Bank of India", "https://www.rbi.org.in/pressreleases_rss.xml", "en", "india", ["www.rbi.org.in", "rbi.org.in", "website.rbi.org.in"]),
  o("rbi-notif", "Reserve Bank of India (notifications)", "https://www.rbi.org.in/notifications_rss.xml", "en", "india", ["www.rbi.org.in", "rbi.org.in", "website.rbi.org.in"], "rbi"),
  o("sebi", "SEBI", "https://www.sebi.gov.in/sebirss.xml", "en", "india", ["www.sebi.gov.in", "sebi.gov.in"]),
  o("mea", "Ministry of External Affairs", "https://www.mea.gov.in/rss/press-releases.xml", "en", "india", ["www.mea.gov.in", "mea.gov.in"]),
  o("isro", "ISRO", "https://www.isro.gov.in/rss.xml", "en", "india", ["www.isro.gov.in", "isro.gov.in"]),
  o("eci", "Election Commission of India", "https://www.eci.gov.in/rss", "en", "india", ["www.eci.gov.in", "eci.gov.in"]),
  o("imd", "India Meteorological Department", "https://mausam.imd.gov.in/imd_latest/contents/rss.xml", "en", "india", ["mausam.imd.gov.in"]),
  o("dd-news", "DD News", "https://ddnews.gov.in/en/feed/", "en", "india", ["ddnews.gov.in", "www.ddnews.gov.in"], "prasar-bharati"),
  o("dd-news-hi", "डीडी न्यूज़", "https://ddnews.gov.in/hi/feed/", "hi", "india", ["ddnews.gov.in", "www.ddnews.gov.in"], "prasar-bharati"),
  o("air-gu", "આકાશવાણી સમાચાર", "https://www.newsonair.gov.in/gu/feed/", "gu", "gujarat", ["www.newsonair.gov.in", "newsonair.gov.in"], "prasar-bharati"),
  o("air-en", "All India Radio News", "https://www.newsonair.gov.in/feed/", "en", "india", ["www.newsonair.gov.in", "newsonair.gov.in"], "prasar-bharati"),
  o("sci", "Supreme Court of India", "https://www.sci.gov.in/feed/", "en", "india", ["www.sci.gov.in", "sci.gov.in"]),
  o("niti", "NITI Aayog", "https://www.niti.gov.in/rss.xml", "en", "india", ["www.niti.gov.in", "niti.gov.in"]),
  o("mygov", "MyGov", "https://www.mygov.in/rss/news/", "en", "india", ["www.mygov.in", "mygov.in"]),

  // ---- Gujarat ----
  o("cmo-gu", "મુખ્યમંત્રી કાર્યાલય, ગુજરાત", "https://cmogujarat.gov.in/gu/rss.xml", "gu", "gujarat", ["cmogujarat.gov.in"], "gujarat-gov"),
  o("gujinfo", "માહિતી ખાતું, ગુજરાત", "https://gujaratinformation.gujarat.gov.in/rss.xml", "gu", "gujarat", ["gujaratinformation.gujarat.gov.in"], "gujarat-gov"),
  o("guj-hc", "Gujarat High Court", "https://gujarathighcourt.nic.in/rss.xml", "en", "gujarat", ["gujarathighcourt.nic.in"]),

  // ---- the world bodies ----
  o("un", "UN News", "https://news.un.org/feed/subscribe/en/news/all/rss.xml", "en", "world", ["news.un.org"], "un"),
  o("un-hi", "संयुक्त राष्ट्र समाचार", "https://news.un.org/feed/subscribe/hi/news/all/rss.xml", "hi", "world", ["news.un.org"], "un"),
  o("who", "World Health Organization", "https://www.who.int/rss-feeds/news-english.xml", "en", "world", ["www.who.int", "who.int"]),
  o("imf", "IMF", "https://www.imf.org/en/News/RSS?language=eng", "en", "world", ["www.imf.org", "imf.org"]),
  o("worldbank", "World Bank", "https://www.worldbank.org/en/news/all?format=rss", "en", "world", ["www.worldbank.org", "worldbank.org"]),
  o("wto", "WTO", "https://www.wto.org/library/rss/latest_news_e.xml", "en", "world", ["www.wto.org", "wto.org"]),
  o("unicef", "UNICEF", "https://www.unicef.org/press-releases/rss.xml", "en", "world", ["www.unicef.org"], "un"),
  o("unhcr", "UNHCR", "https://www.unhcr.org/rss/news.xml", "en", "world", ["www.unhcr.org"], "un"),
  o("fao", "FAO", "https://www.fao.org/newsroom/rss/en/", "en", "world", ["www.fao.org"], "un"),
  o("iaea", "IAEA", "https://www.iaea.org/feeds/topnews", "en", "world", ["www.iaea.org"], "un"),
  o("nato", "NATO", "https://www.nato.int/cps/rss/en/natohq/rssFeed.xsl/rssFeed.xml", "en", "world", ["www.nato.int"]),
  o("eu", "European Commission", "https://ec.europa.eu/commission/presscorner/api/rss?language=en", "en", "world", ["ec.europa.eu"], "eu"),
  o("eu-council", "Council of the EU", "https://www.consilium.europa.eu/en/rss/pressreleases.ashx", "en", "world", ["www.consilium.europa.eu"], "eu"),
  o("icc", "International Cricket Council", "https://www.icc-cricket.com/rss/news", "en", "world", ["www.icc-cricket.com"]),
  o("ioc", "International Olympic Committee", "https://www.olympics.com/ioc/news/rss", "en", "world", ["www.olympics.com"]),

  // ---- the main offices of ~30 countries (heads of government, foreign ministries, key agencies) ----
  o("us-state", "US State Department", "https://www.state.gov/rss-feed/press-releases/feed/", "en", "world", ["www.state.gov", "state.gov"], "us-gov"),
  o("us-whitehouse", "The White House", "https://www.whitehouse.gov/feed/", "en", "world", ["www.whitehouse.gov"], "us-gov"),
  o("us-treasury", "US Treasury", "https://home.treasury.gov/system/files/126/ofac.xml", "en", "world", ["home.treasury.gov"], "us-gov"),
  o("us-fed", "US Federal Reserve", "https://www.federalreserve.gov/feeds/press_all.xml", "en", "world", ["www.federalreserve.gov"], "us-gov"),
  o("nasa", "NASA", "https://www.nasa.gov/news-release/feed/", "en", "world", ["www.nasa.gov"], "us-gov"),
  o("us-cdc", "US CDC", "https://tools.cdc.gov/api/v2/resources/media/132608.rss", "en", "world", ["www.cdc.gov", "tools.cdc.gov"], "us-gov"),
  govuk("uk-pm", "UK Prime Minister's Office", "prime-ministers-office-10-downing-street"),
  govuk("uk-fcdo", "UK Foreign Office", "foreign-commonwealth-development-office"),
  govuk("uk-treasury", "HM Treasury", "hm-treasury"),
  govuk("uk-home", "UK Home Office", "home-office"),
  o("ca-pm", "Prime Minister of Canada", "https://www.pm.gc.ca/en/news.rss", "en", "world", ["www.pm.gc.ca", "pm.gc.ca"], "ca-gov"),
  o("ca-gac", "Global Affairs Canada", "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofforeignaffairstradeanddevelopment&sort=publishedDate&orderBy=desc&pick=50&format=atom", "en", "world", ["www.canada.ca"], "ca-gov"),
  o("au-pm", "Prime Minister of Australia", "https://www.pm.gov.au/media.rss", "en", "world", ["www.pm.gov.au"], "au-gov"),
  o("au-dfat", "Australia's Foreign Minister", "https://www.foreignminister.gov.au/rss.xml", "en", "world", ["www.foreignminister.gov.au"], "au-gov"),
  o("nz-gov", "New Zealand Government", "https://www.beehive.govt.nz/rss.xml", "en", "world", ["www.beehive.govt.nz"]),
  o("ru-kremlin", "The Kremlin", "http://en.kremlin.ru/events/president/news/feed", "en", "world", ["en.kremlin.ru"], "ru-gov"),
  o("ru-mid", "Russia's Foreign Ministry", "https://mid.ru/en/rss.php", "en", "world", ["mid.ru"], "ru-gov"),
  o("cn-mfa", "China's Foreign Ministry", "https://www.mfa.gov.cn/eng/rss.xml", "en", "world", ["www.mfa.gov.cn", "www.fmprc.gov.cn"], "cn-gov"),
  o("cn-gov", "The State Council of China", "https://english.www.gov.cn/rss/news.xml", "en", "world", ["english.www.gov.cn"], "cn-gov"),
  o("jp-mofa", "Japan's Foreign Ministry", "https://www.mofa.go.jp/rss/press.xml", "en", "world", ["www.mofa.go.jp"], "jp-gov"),
  o("jp-kantei", "Prime Minister of Japan", "https://japan.kantei.go.jp/index-e.rdf", "en", "world", ["japan.kantei.go.jp"], "jp-gov"),
  o("de-gov", "German Federal Government", "https://www.bundesregierung.de/service/rss/breg-en/1151244/feed.xml", "en", "world", ["www.bundesregierung.de"], "de-gov"),
  o("fr-elysee", "Élysée (France)", "https://www.elysee.fr/en/rss", "en", "world", ["www.elysee.fr"], "fr-gov"),
  o("fr-diplo", "France Diplomacy", "https://www.diplomatie.gouv.fr/spip.php?page=backend-fd&lang=en", "en", "world", ["www.diplomatie.gouv.fr"], "fr-gov"),
  o("it-gov", "Italian Government", "https://www.governo.it/en/feed/rss", "en", "world", ["www.governo.it"]),
  o("kr-mofa", "South Korea's Foreign Ministry", "https://www.mofa.go.kr/eng/rss/news.xml", "en", "world", ["www.mofa.go.kr"]),
  o("sg-mfa", "Singapore's Foreign Ministry", "https://www.mfa.gov.sg/rss/press-statements", "en", "world", ["www.mfa.gov.sg"]),
  o("ae-wam", "WAM (UAE news agency)", "https://www.wam.ae/en/rss", "en", "world", ["www.wam.ae"]),
  o("sa-spa", "Saudi Press Agency", "https://www.spa.gov.sa/en/rss", "en", "world", ["www.spa.gov.sa"]),
  o("il-mfa", "Israel's Foreign Ministry", "https://www.gov.il/en/rss/mfa", "en", "world", ["www.gov.il"]),
  o("ua-pres", "President of Ukraine", "https://www.president.gov.ua/en/rss", "en", "world", ["www.president.gov.ua"]),
  o("za-gov", "South African Government", "https://www.gov.za/news/rss.xml", "en", "world", ["www.gov.za"]),
  o("br-gov", "Government of Brazil", "https://www.gov.br/en/rss", "en", "world", ["www.gov.br"]),
  o("bd-mofa", "Bangladesh Foreign Ministry", "https://mofa.gov.bd/rss.xml", "en", "world", ["mofa.gov.bd"]),
  o("lk-pmd", "Sri Lanka President's Media Division", "https://pmd.gov.lk/feed/", "en", "world", ["pmd.gov.lk"]),
  o("np-mofa", "Nepal's Foreign Ministry", "https://mofa.gov.np/feed/", "en", "world", ["mofa.gov.np"]),
  o("pk-mofa", "Pakistan's Foreign Office", "https://mofa.gov.pk/feed/", "en", "world", ["mofa.gov.pk"]),
  o("mv-pres", "President of the Maldives", "https://presidency.gov.mv/rss", "en", "world", ["presidency.gov.mv"]),
  o("id-setkab", "Cabinet of Indonesia", "https://setkab.go.id/en/feed/", "en", "world", ["setkab.go.id"]),
  o("my-pmo", "Prime Minister of Malaysia", "https://www.pmo.gov.my/feed/", "en", "world", ["www.pmo.gov.my"]),
  o("ph-pco", "Philippine Presidential Communications Office", "https://pco.gov.ph/feed/", "en", "world", ["pco.gov.ph"]),
  o("eg-sis", "Egypt State Information Service", "https://www.sis.gov.eg/rss.aspx?lang=en-us", "en", "world", ["www.sis.gov.eg"]),
  o("ng-statehouse", "Nigeria State House", "https://statehouse.gov.ng/feed/", "en", "world", ["statehouse.gov.ng"]),
  o("ke-pres", "President of Kenya", "https://www.president.go.ke/feed/", "en", "world", ["www.president.go.ke"]),

  // ---- Gujarati outlets ----
  n("divya-bhaskar", "દિવ્ય ભાસ્કર", "https://www.divyabhaskar.co.in/rss-v1--category-1048.xml", "gu", "gujarat", ["www.divyabhaskar.co.in", "divyabhaskar.co.in"], "db-corp"),
  n("gujarat-samachar", "ગુજરાત સમાચાર", "https://www.gujaratsamachar.com/rss/top-stories", "gu", "gujarat", ["www.gujaratsamachar.com"], "gujarat-samachar"),
  n("sandesh", "સંદેશ", "https://sandesh.com/rss/gujarat.xml", "gu", "gujarat", ["sandesh.com", "www.sandesh.com"], "sandesh"),
  n("bbc-gu", "BBC ગુજરાતી", "https://feeds.bbci.co.uk/gujarati/rss.xml", "gu", "india", ["www.bbc.com", "www.bbc.co.uk"], "bbc"),
  n("news18-gu", "ન્યૂઝ18 ગુજરાતી", "https://gujarati.news18.com/rss/khabar/gujarat/gujarat.xml", "gu", "gujarat", ["gujarati.news18.com"], "network18"),
  n("tv9-gu", "ટીવી9 ગુજરાતી", "https://tv9gujarati.com/feed", "gu", "gujarat", ["tv9gujarati.com"], "tv9"),
  n("abp-asmita", "એબીપી અસ્મિતા", "https://gujarati.abplive.com/home/feed", "gu", "gujarat", ["gujarati.abplive.com"], "abp"),
  n("zee-gu", "ઝી 24 કલાક", "https://zeenews.india.com/gujarati/rss/gujarat.xml", "gu", "gujarat", ["zeenews.india.com"], "zee"),
  n("iamgujarat", "આઈ એમ ગુજરાત", "https://www.iamgujarat.com/rssfeedsdefault.cms", "gu", "gujarat", ["www.iamgujarat.com"], "times-group"),
  n("deshgujarat", "DeshGujarat", "https://www.deshgujarat.com/feed/", "en", "gujarat", ["www.deshgujarat.com"], "deshgujarat"),

  // ---- Hindi outlets ----
  n("dainik-bhaskar", "दैनिक भास्कर", "https://www.bhaskar.com/rss-v1--category-1061.xml", "hi", "india", ["www.bhaskar.com"], "db-corp"),
  n("bbc-hi", "BBC हिंदी", "https://feeds.bbci.co.uk/hindi/rss.xml", "hi", "india", ["www.bbc.com", "www.bbc.co.uk"], "bbc"),
  n("amar-ujala", "अमर उजाला", "https://www.amarujala.com/rss/breaking-news.xml", "hi", "india", ["www.amarujala.com"], "amar-ujala"),
  n("jagran", "दैनिक जागरण", "https://www.jagran.com/rss/news/national.xml", "hi", "india", ["www.jagran.com"], "jagran"),
  n("live-hindustan", "लाइव हिन्दुस्तान", "https://feed.livehindustan.com/rss/3127", "hi", "india", ["www.livehindustan.com"], "ht-media"),

  // ---- Indian English outlets ----
  n("the-hindu", "The Hindu", "https://www.thehindu.com/news/national/feeder/default.rss", "en", "india", ["www.thehindu.com"], "the-hindu"),
  n("the-hindu-world", "The Hindu (world)", "https://www.thehindu.com/news/international/feeder/default.rss", "en", "world", ["www.thehindu.com"], "the-hindu"),
  n("indian-express", "The Indian Express", "https://indianexpress.com/section/india/feed/", "en", "india", ["indianexpress.com"], "indian-express"),
  n("ie-ahmedabad", "The Indian Express (Ahmedabad)", "https://indianexpress.com/section/cities/ahmedabad/feed/", "en", "gujarat", ["indianexpress.com"], "indian-express"),
  n("toi", "The Times of India", "https://timesofindia.indiatimes.com/rssfeedstopstories.cms", "en", "india", ["timesofindia.indiatimes.com"], "times-group"),
  n("toi-ahmedabad", "The Times of India (Ahmedabad)", "https://timesofindia.indiatimes.com/rssfeeds/-2128821153.cms", "en", "gujarat", ["timesofindia.indiatimes.com"], "times-group"),
  n("ht", "Hindustan Times", "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", "en", "india", ["www.hindustantimes.com"], "ht-media"),
  n("ndtv", "NDTV", "https://feeds.feedburner.com/ndtvnews-top-stories", "en", "india", ["www.ndtv.com", "feeds.feedburner.com"], "ndtv"),
  n("livemint", "Mint", "https://www.livemint.com/rss/news", "en", "india", ["www.livemint.com"], "ht-media"),
  n("et", "The Economic Times", "https://economictimes.indiatimes.com/rssfeedstopstories.cms", "en", "india", ["economictimes.indiatimes.com"], "times-group"),
  n("business-standard", "Business Standard", "https://www.business-standard.com/rss/latest.rss", "en", "india", ["www.business-standard.com"], "business-standard"),
  n("pti", "Press Trust of India", "https://www.ptinews.com/rss/national.xml", "en", "india", ["www.ptinews.com"], "pti"),
  n("espncricinfo", "ESPNcricinfo", "https://www.espncricinfo.com/rss/content/story/feeds/0.xml", "en", "world", ["www.espncricinfo.com"], "espn"),

  // ---- world outlets ----
  n("bbc-world", "BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml", "en", "world", ["www.bbc.com", "www.bbc.co.uk"], "bbc"),
  n("bbc-india", "BBC News (India)", "https://feeds.bbci.co.uk/news/world/asia/india/rss.xml", "en", "india", ["www.bbc.com", "www.bbc.co.uk"], "bbc"),
  n("aljazeera", "Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", "en", "world", ["www.aljazeera.com"], "al-jazeera"),
  n("guardian", "The Guardian", "https://www.theguardian.com/world/rss", "en", "world", ["www.theguardian.com"], "guardian"),
  n("dw", "DW", "https://rss.dw.com/rdf/rss-en-all", "en", "world", ["www.dw.com"], "dw"),
  n("france24", "France 24", "https://www.france24.com/en/rss", "en", "world", ["www.france24.com"], "france-medias-monde"),
  n("npr", "NPR", "https://feeds.npr.org/1004/rss.xml", "en", "world", ["www.npr.org"], "npr"),
  n("abc-au", "ABC News (Australia)", "https://www.abc.net.au/news/feed/51120/rss.xml", "en", "world", ["www.abc.net.au"], "abc-au"),
  n("cbc", "CBC News", "https://www.cbc.ca/webfeed/rss/rss-world", "en", "world", ["www.cbc.ca"], "cbc"),
  n("nhk", "NHK World", "https://www3.nhk.or.jp/nhkworld/en/news/rss.xml", "en", "world", ["www3.nhk.or.jp"], "nhk"),
  n("cna", "CNA (Singapore)", "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml", "en", "world", ["www.channelnewsasia.com"], "mediacorp"),
  n("scmp", "South China Morning Post", "https://www.scmp.com/rss/91/feed", "en", "world", ["www.scmp.com"], "scmp"),

  // ---- fact-checkers (IFCN signatories, and the government's own) ----
  f("pib-factcheck", "PIB Fact Check", "https://factcheck.pib.gov.in/rss.xml", "en", ["factcheck.pib.gov.in"]),
  f("altnews", "Alt News", "https://www.altnews.in/feed/", "en", ["www.altnews.in"]),
  f("boom", "BOOM", "https://www.boomlive.in/feeds/rss", "en", ["www.boomlive.in"]),
  f("factly", "Factly", "https://factly.in/feed/", "en", ["factly.in"]),
  f("vishvas", "Vishvas News", "https://www.vishvasnews.com/feed/", "hi", ["www.vishvasnews.com"]),
  f("newschecker", "Newschecker", "https://newschecker.in/feed", "en", ["newschecker.in"]),
  f("afp-factcheck", "AFP Fact Check", "https://factcheck.afp.com/rss.xml", "en", ["factcheck.afp.com"]),
];

export const sourceById = new Map(SOURCES.map((s) => [s.id, s]));
