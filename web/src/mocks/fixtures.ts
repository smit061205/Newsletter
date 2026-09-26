// Fixture IssueResponse data for MSW (docs/FRONTEND_ROADMAP.md Part E step 5).
//
// Coordinates (x/y/width/height) below REPLICATE the real
// "(196) Capital Kranti_08 august.pdf" -- all 4 pages, ~19 real article
// regions derived from that PDF's own extracted element positions
// (capital_kranti_zone_map.json, raw196 pt, converted to px via
// PX_PER_PT=300/72), not hand-designed placeholder boxes. See
// scripts/extract_zone_clusters.py for the clustering method used to group
// the map's 43+28+25+53 raw text/photo/box elements per page into ~4-6
// article-level regions each (one bounding box per real headline_L1/L2
// anchor, everything spatially near it absorbed into the same cluster).
//
// This is a REPLICATION OF POSITIONS ONLY, not of the original text: the
// source PDF's body copy is set in a legacy pre-Unicode Bharati font whose
// glyphs don't map to readable Gujarati (confirmed this project's earlier
// session -- see the archived content.ts's own header comment), so the
// TITLE/KICKER/BODY strings below are this project's own previously-
// authored real-news content (PIB Ahmedabad releases, docs/PRECISION_ROADMAP.md)
// reused across the real positions -- some stories intentionally appear at
// more than one position/page, since there are 9 authored stories for ~15
// text-bearing real regions. That's disclosed reuse for coordinate-pipeline
// testing ("mock data method"), not a content bug -- a real backend would
// send 15 distinct real stories here, not repeats.
//
// A handful of the clustered boxes required a manual clip to stay
// non-overlapping: this real newspaper sometimes reuses the SAME column
// track for two different stories at different vertical ranges (a
// headline's own width reaching into a neighbor's column further up the
// page) -- a real "text-threading" layout that a flat one-rectangle-per-
// article model can't represent exactly. Documented at each clip below
// rather than silently rounding the numbers away.

import type { IssueResponse, ArticleType } from "@/lib/contract";

const PX_PER_PT = 300 / 72; // gridSpec.ts's own exact 300-DPI ratio

interface StoryText {
  title: string;
  kicker?: string;
  body: string;
  photoCaption?: string;
}

const SAMARTH_BODY =
  "ગાંધીનગર: IIT ગાંધીનગર ખાતે શનિવારે 'સામર્થ્ય' (સિલિકોન એન્ડ એડવાન્સ્ડ સેમિકન્ડક્ટર " +
  "મેન્યુફેક્ચરિંગ રિસર્ચ એન્ડ ટ્રેનિંગ હબ) પ્રોજેક્ટની પૂર્વ-શુભારંભ બેઠક યોજાઈ હતી. " +
  "ગુજરાતની વિવિધ યુનિવર્સિટીઓ અને એન્જિનિયરિંગ સંસ્થાઓના પ્રતિનિધિઓએ બેઠકમાં ભાગ લઈ " +
  "અભ્યાસક્રમ, તાલીમ અને સંશોધન સહયોગ અંગે પોતાના મંતવ્યો રજૂ કર્યા હતા. " +
  "ઇલેક્ટ્રોનિક્સ અને ઇન્ફોર્મેશન ટેકનોલોજી મંત્રાલય, ગુજરાત સરકાર અને IITGN ના સંયુક્ત આ " +
  "પ્રોજેક્ટ હેઠળ આગામી પાંચ વર્ષમાં 10,000થી વધુ વિદ્યાર્થીઓ-ટેકનિશિયનોને તાલીમ તેમજ " +
  "1,000થી વધુ ઉદ્યોગ વ્યાવસાયિકોને અપસ્કિલ કરાશે. સંસ્થાના ડિરેક્ટર પ્રો. રજત મૂનાએ જણાવ્યું " +
  "કે સેમિકન્ડક્ટર ક્ષેત્રે કુશળ માનવબળ તૈયાર કરવું એ ભારતની સ્પર્ધાત્મકતા માટે અનિવાર્ય છે. " +
  "બેઠકમાં ગુજરાત ટેકનોલોજિકલ યુનિવર્સિટી, નિરમા યુનિવર્સિટી, પંડિત દીનદયાળ એનર્જી " +
  "યુનિવર્સિટી અને રાજ્યની અન્ય ઇજનેરી કોલેજોના પ્રતિનિધિઓ ઉપસ્થિત રહ્યા હતા. ચર્ચા દરમિયાન " +
  "સેમિકન્ડક્ટર ડિઝાઇન, ફેબ્રિકેશન અને પેકેજિંગ ક્ષેત્રે અભ્યાસક્રમ કેવી રીતે ઉદ્યોગની " +
  "જરૂરિયાતો સાથે સુસંગત બનાવવો તે અંગે વિગતવાર ચર્ચા થઈ હતી. " +
  "'સામર્થ્ય' હબ ભારત સરકારના રાષ્ટ્રીય સેમિકન્ડક્ટર મિશન હેઠળ સ્થાપાઈ રહ્યું છે, જેનો " +
  "ઉદ્દેશ્ય દેશને વૈશ્વિક સેમિકન્ડક્ટર સપ્લાય ચેઇનમાં અગ્રણી સ્થાન અપાવવાનો છે. IIT " +
  "ગાંધીનગર ખાતે અદ્યતન ક્લીનરૂમ સુવિધા, ડિઝાઇન લેબોરેટરી અને ટેસ્ટિંગ ઈન્ફ્રાસ્ટ્રક્ચર " +
  "ઊભું કરવામાં આવશે, જે વિદ્યાર્થીઓને હાથોહાથ તાલીમ આપશે. " +
  "પ્રો. મૂનાએ ઉમેર્યું કે પ્રથમ તબક્કામાં આગામી શૈક્ષણિક વર્ષથી પ્રમાણપત્ર અભ્યાસક્રમો " +
  "શરૂ કરવામાં આવશે, ત્યારબાદ સ્નાતક અને અનુસ્નાતક કક્ષાના વિશેષ કાર્યક્રમો ઉમેરાશે. " +
  "ઉદ્યોગ ભાગીદારો સાથે ઇન્ટર્નશિપ અને પ્લેસમેન્ટ માટે પણ સમજૂતી કરાર કરવામાં આવશે. " +
  "ગુજરાત સરકારે અગાઉ ધોલેરા ખાતે સેમિકન્ડક્ટર ફેબ્રિકેશન યુનિટ સ્થાપવાની જાહેરાત કરી " +
  "હતી, અને 'સામર્થ્ય' હબ આ સમગ્ર ઇકોસિસ્ટમ માટે કુશળ માનવબળ પૂરું પાડવામાં મહત્ત્વની " +
  "ભૂમિકા ભજવશે તેમ અધિકારીઓએ જણાવ્યું હતું.";

const PRAG_BODY =
  "ગાંધીનગર: IIT ગાંધીનગરે 11 ઓગસ્ટના રોજ 'પ્રાગ' (પોલિસી રિસર્ચ એન્ડ એનાલિટિક્સ ફોર " +
  "ગવર્નન્સ) પહેલનો પ્રારંભ કર્યો, જે ટેકનોલોજી, જાહેર નીતિ અને શાસનને એક મંચ પર લાવવાનો પ્રયાસ છે. " +
  "સંસ્થાના ફાઉન્ડેશન કાર્યક્રમ અંતર્ગત યોજાયેલ આ પ્રસંગે 'જાહેર નીતિમાં ટેકનોલોજી સંસ્થાઓની " +
  "ભૂમિકા' વિષય પર પેનલ ચર્ચા યોજાઈ હતી. ગુજરાત સરકારના ભૂતપૂર્વ મુખ્ય સચિવ શ્રી રાજ કુમાર અને " +
  "ભૂતપૂર્વ અધિક મુખ્ય સચિવ શ્રી જે.પી. ગુપ્તા સહિત અનેક નિષ્ણાતોએ ચર્ચામાં ભાગ લીધો હતો. " +
  "પ્રો. પ્રહર્ષ એમ. પટેલ અને પ્રો. દીપક સિંઘાનિયા આ પહેલનું સંકલન કરી રહ્યા છે. " +
  "કાર્યક્રમમાં IIT ગાંધીનગરના ડિરેક્ટર પ્રો. રજત મૂના અને સ્કૂલ ઓફ પબ્લિક પોલિસીના " +
  "વડાએ પણ સંબોધન કર્યું હતું. તેમણે જણાવ્યું કે 'પ્રાગ' પહેલ હેઠળ સંસ્થા આગામી સમયમાં " +
  "રાજ્ય અને કેન્દ્ર સરકારના વિવિધ વિભાગો સાથે મળીને નીતિ-સંશોધન પ્રોજેક્ટ્સ હાથ ધરશે. " +
  "પેનલ ચર્ચામાં આર્ટિફિશિયલ ઇન્ટેલિજન્સ, ડેટા ગવર્નન્સ અને સ્માર્ટ સિટી આયોજન જેવા " +
  "વિષયો પર ટેકનોલોજી સંસ્થાઓ કેવી રીતે નીતિ ઘડતરમાં યોગદાન આપી શકે તે અંગે વિસ્તૃત " +
  "ચર્ચા થઈ હતી. વક્તાઓએ એ બાબત પર ભાર મૂક્યો કે શૈક્ષણિક સંસ્થાઓ અને સરકારી તંત્ર " +
  "વચ્ચેનું અંતર ઘટાડવું જરૂરી છે. " +
  "પ્રો. પ્રહર્ષ પટેલે જણાવ્યું કે 'પ્રાગ' અંતર્ગત વિદ્યાર્થીઓ અને સંશોધકોને વાસ્તવિક " +
  "નીતિ-સંબંધિત પડકારો પર કામ કરવાની તક મળશે, જેનાથી તેમને પ્રત્યક્ષ અનુભવ પ્રાપ્ત " +
  "થશે. પહેલના પ્રથમ તબક્કામાં ત્રણ સંશોધન પ્રોજેક્ટ્સ પર કામ શરૂ કરવામાં આવ્યું છે.";

const NIFT_BODY =
  "ગાંધીનગર: NIFT ગાંધીનગર અને ગુજરાત સરકારના રોજગાર અને તાલીમ નિયામકની કચેરીના સંયુક્ત " +
  "ઉપક્રમે 'યુનિફોર્મ ડિઝાઇન હેકાથોન 2026'નો પ્રારંભ NIFT કેમ્પસ ખાતે થયો હતો. NIFT ગાંધીનગર " +
  "અને ગુજરાત યુનિવર્સિટીની કુલ ચાર વિદ્યાર્થી ટીમો રાજ્યની સરકારી ITI સંસ્થાઓ માટે કાર્યક્ષમ " +
  "અને પોસાય તેવા યુનિફોર્મ ડિઝાઇન કરવા 24 કલાક સતત કામ કરી રહી છે. વિજેતા ડિઝાઇનનો ખર્ચ " +
  "પ્રતિ યુનિફોર્મ ₹1,000થી વધુ ન હોવો જોઈએ. પ્રથમ ટીમને ₹50,000, બીજીને ₹30,000 અને ત્રીજીને " +
  "₹20,000નું ઇનામ અપાશે. " +
  "સ્પર્ધામાં ભાગ લેતી ટીમોને કાચો માલ, ડિઝાઇન ટૂલ્સ અને મેન્ટરશિપ સંસ્થા તરફથી પૂરાં " +
  "પાડવામાં આવ્યાં હતાં. દરેક ટીમે 24 કલાકના સમયગાળામાં ડિઝાઇન કન્સેપ્ટથી લઈને અંતિમ " +
  "પ્રોટોટાઇપ સુધીની સમગ્ર પ્રક્રિયા પૂર્ણ કરવાની હતી. " +
  "નિર્ણાયક મંડળમાં NIFTના ફેકલ્ટી ઉપરાંત ટેક્સટાઇલ ઉદ્યોગના નિષ્ણાતોનો સમાવેશ થયો " +
  "હતો, જેમણે ડિઝાઇનની કાર્યક્ષમતા, ટકાઉપણું અને ખર્ચ-અસરકારકતાના આધારે મૂલ્યાંકન " +
  "કર્યું હતું. કાર્યક્રમના સંયોજકોએ જણાવ્યું કે વિજેતા ડિઝાઇનનો ઉપયોગ આગામી શૈક્ષણિક " +
  "વર્ષથી રાજ્યની પસંદગીની ITI સંસ્થાઓમાં પાયલોટ ધોરણે કરવામાં આવશે. " +
  "ગુજરાત સરકારના રોજગાર અને તાલીમ નિયામકે જણાવ્યું કે આ પહેલનો ઉદ્દેશ્ય ITI " +
  "તાલીમાર્થીઓને વ્યાવસાયિક અને આરામદાયક યુનિફોર્મ પૂરો પાડવાની સાથે યુવા ડિઝાઇનરોને " +
  "વાસ્તવિક-જીવન પ્રોજેક્ટ પર કામ કરવાની તક આપવાનો પણ છે.";

const PM_VISIT_BODY =
  "અમદાવાદ: વડાપ્રધાન નરેન્દ્ર મોદી 25-26 ઓગસ્ટના રોજ ગુજરાતની મુલાકાતે આવશે. તેઓ 25 " +
  "ઓગસ્ટે સાંજે ખોડલધામ મેદાન, અમદાવાદ ખાતે ₹5,400 કરોડથી વધુના વિવિધ વિકાસ પ્રોજેક્ટ્સનું " +
  "લોકાર્પણ અને શિલાન્યાસ કરશે. 26 ઓગસ્ટે તેઓ હાંસલપુર ખાતે સુઝુકીની પ્રથમ ગ્લોબલ બેટરી " +
  "ઇલેક્ટ્રિક વ્હીકલ 'e VITARA'ને 100થી વધુ દેશોમાં નિકાસ માટે લીલી ઝંડી આપશે તેમજ હાઇબ્રિડ " +
  "બેટરી ઇલેક્ટ્રોડના સ્થાનિક ઉત્પાદનનું ઉદ્ઘાટન કરશે. કાર્યક્રમમાં ₹1,400 કરોડથી વધુના રેલવે " +
  "પ્રોજેક્ટ્સ પણ રાષ્ટ્રને અર્પણ કરાશે. " +
  "વડાપ્રધાનની આ મુલાકાત દરમિયાન રાજ્યના મુખ્યમંત્રી ભૂપેન્દ્ર પટેલ અને અન્ય વરિષ્ઠ " +
  "મંત્રીઓ પણ ઉપસ્થિત રહેશે. કાર્યક્રમમાં ઓટોમોબાઇલ, રિન્યુએબલ એનર્જી અને લોજિસ્ટિક્સ " +
  "ક્ષેત્રના અનેક પ્રોજેક્ટ્સનો સમાવેશ થાય છે, જે રાજ્યમાં રોજગારીની નવી તકો ઊભી " +
  "કરશે તેમ સરકારી સૂત્રોએ જણાવ્યું હતું. " +
  "સુઝુકીના 'e VITARA' પ્રોજેક્ટને ગુજરાતના ઓટોમોબાઇલ ઉત્પાદન ક્ષેત્ર માટે એક " +
  "મહત્ત્વપૂર્ણ સીમાચિહ્ન ગણવામાં આવે છે, કારણ કે તે ભારતમાંથી ઇલેક્ટ્રિક વાહનોની " +
  "નિકાસની શરૂઆત દર્શાવે છે. હાંસલપુર પ્લાન્ટ ખાતે બેટરી ઉત્પાદનની સ્થાનિક ક્ષમતા " +
  "ઊભી થવાથી આયાત પરની નિર્ભરતા પણ ઘટશે. " +
  "સુરક્ષા વ્યવસ્થાના ભાગરૂપે અમદાવાદ અને હાંસલપુર વિસ્તારમાં ચુસ્ત બંદોબસ્ત ગોઠવવામાં " +
  "આવ્યો છે. વહીવટી તંત્રે નાગરિકોને કાર્યક્રમ સ્થળે સમયસર પહોંચવા અને ટ્રાફિક " +
  "નિયમોનું પાલન કરવા અપીલ કરી છે.";

const UPI_BODY =
  "નવી દિલ્હી: રિઝર્વ બેંક ઓફ ઇન્ડિયા (RBI)ની દેખરેખ હેઠળ નેશનલ પેમેન્ટ્સ કોર્પોરેશન ઓફ " +
  "ઇન્ડિયા (NPCI) દ્વારા 25 ઓગસ્ટ, 2016ના રોજ શરૂ કરાયેલ યુનિફાઇડ પેમેન્ટ્સ ઇન્ટરફેસ (UPI)એ " +
  "ડિજિટલ પેમેન્ટ ક્રાંતિના 10 વર્ષ પૂર્ણ કર્યા છે. વાર્ષિક ટ્રાન્ઝેક્શન વોલ્યુમ નાણાકીય વર્ષ " +
  "2016-17માં માત્ર 1.78 કરોડથી વધીને 2025-26માં 24,162 કરોડથી વધુ થયું છે, જે લગભગ 13,000 " +
  "ગણો વધારો દર્શાવે છે. UPI હાલમાં 11 દેશોમાં કાર્યરત છે અને ક્રોસ-બોર્ડર ડિજિટલ પેમેન્ટ્સ " +
  "માટે વૈશ્વિક પ્લેટફોર્મ તરીકે ઉભરી આવ્યું છે. " +
  "NPCIના જણાવ્યા મુજબ, ઓગસ્ટ 2025માં એકલા મહિનામાં જ 19.6 અબજથી વધુ ટ્રાન્ઝેક્શન " +
  "નોંધાયા હતા, જે UPIની વ્યાપક સ્વીકૃતિ દર્શાવે છે. નાના વેપારીઓથી લઈને મોટા " +
  "શોપિંગ મોલ્સ સુધી, UPI હવે રોજિંદા વ્યવહારોનું અભિન્ન અંગ બની ગયું છે. " +
  "RBIના ગવર્નરે તાજેતરમાં જણાવ્યું હતું કે UPIની સફળતા ભારતના ડિજિટલ પબ્લિક " +
  "ઇન્ફ્રાસ્ટ્રક્ચર મોડલનું ઉત્તમ ઉદાહરણ છે, જેને હવે અન્ય દેશો પણ અપનાવવા ઈચ્છુક છે. " +
  "શ્રીલંકા, UAE, સિંગાપોર અને ફ્રાન્સ સહિતના દેશોમાં UPI-આધારિત પેમેન્ટ સિસ્ટમ " +
  "કાર્યરત કરવામાં આવી છે. " +
  "આગામી તબક્કામાં NPCI ઓફલાઇન પેમેન્ટ ક્ષમતા અને AI-આધારિત ફ્રોડ ડિટેક્શન સિસ્ટમ " +
  "પર કામ કરી રહ્યું છે, જેથી સુરક્ષા વધુ મજબૂત બનાવી શકાય. નિષ્ણાતોના મતે, આગામી " +
  "પાંચ વર્ષમાં UPI ટ્રાન્ઝેક્શન વોલ્યુમ બમણું થવાની શક્યતા છે.";

const RBI_BODY =
  "નવી દિલ્હી: રિઝર્વ બેંક ઓફ ઇન્ડિયા (RBI)ની ખાસ USD-INR ફોરેક્સ સ્વેપ સુવિધાએ દેશમાં " +
  "વિદેશી હૂંડિયામણના પ્રવાહમાં અભૂતપૂર્વ ઉછાળો નોંધાવ્યો છે. 8 જૂન, 2026ના રોજ શરૂ કરાયેલી " +
  "આ યોજના હેઠળ 21 ઓગસ્ટ સુધીમાં કુલ 73 અબજ ડોલરનો પ્રવાહ એકત્ર થયો છે, જેમાં FCNR(B) " +
  "થાપણોનો હિસ્સો 65.40 અબજ ડોલર છે. પ્રતિસાદ એટલો મજબૂત રહ્યો કે RBIએ FCNR(B) વિન્ડો બંધ " +
  "કરવાની તારીખ 30 સપ્ટેમ્બરથી વહેલી કરીને 31 ઓગસ્ટ કરી દીધી છે. " +
  "આ યોજના હેઠળ બેંકોને વિદેશી ચલણમાં થાપણો એકત્ર કરવા માટે પ્રોત્સાહન આપવામાં આવ્યું " +
  "હતું, જેથી રૂપિયા પરના દબાણને હળવું કરી શકાય. નિષ્ણાતોના મતે, આ પગલાથી વિદેશી " +
  "હૂંડિયામણ ભંડારમાં નોંધપાત્ર વધારો થયો છે અને ચલણ બજારમાં સ્થિરતા આવી છે. " +
  "બેંકિંગ ક્ષેત્રના વિશ્લેષકોએ જણાવ્યું કે FCNR(B) યોજનાની સફળતા વૈશ્વિક રોકાણકારોના " +
  "ભારતીય અર્થતંત્ર પરના વિશ્વાસનું પ્રતિબિંબ છે. ખાસ કરીને અમેરિકા, યુકે અને ગલ્ફ " +
  "દેશોમાં વસતા બિનનિવાસી ભારતીયોએ આ યોજનામાં મોટા પાયે ભાગ લીધો હતો. " +
  "RBIએ સ્પષ્ટ કર્યું છે કે વિન્ડો બંધ થયા બાદ પણ હાલની થાપણો તેમની મૂળ મુદત સુધી " +
  "યથાવત્ રહેશે અને તેમાં કોઈ ફેરફાર કરવામાં આવશે નહીં.";

const BHAVNAGAR_BODY =
  "ભાવનગર: શહેરમાં ભેળસેળયુક્ત આલ્કોહોલના સેવનથી સર્જાયેલી ગંભીર ઘટનાને પગલે કેન્દ્રીય " +
  "રાજ્ય મંત્રી શ્રીમતી નિમુબેન બાંભણિયાએ સર ટી હોસ્પિટલની મુલાકાત લઈને જિલ્લા અધિકારીઓ " +
  "સાથે ઉચ્ચસ્તરીય બેઠક યોજી હતી. મંત્રીશ્રીએ જણાવ્યું કે અત્યાર સુધીમાં 44 અસરગ્રસ્તો " +
  "હોસ્પિટલમાં દાખલ થયા હતા, જે પૈકી 29 ડિસ્ચાર્જ થયા છે અને દુ:ખદ રીતે 13 વ્યક્તિઓનાં " +
  "મૃત્યુ થયાં છે. " +
  "પોલીસે આ મામલે તાત્કાલિક તપાસ શરૂ કરી છે અને ભેળસેળયુક્ત દારૂના વેચાણ સાથે " +
  "સંકળાયેલા શંકાસ્પદોની ધરપકડ કરી છે. જિલ્લા વહીવટી તંત્રે અસરગ્રસ્ત વિસ્તારોમાં " +
  "ગેરકાયદેસર દારૂના વેચાણ સામે વિશેષ ઝુંબેશ હાથ ધરી છે. " +
  "મંત્રી બાંભણિયાએ જણાવ્યું કે સારવાર હેઠળના તમામ દર્દીઓને શ્રેષ્ઠ તબીબી સુવિધા " +
  "આપવામાં આવી રહી છે અને રાજ્ય સરકાર અસરગ્રસ્ત પરિવારોને આર્થિક સહાય પૂરી પાડશે. " +
  "તેમણે નાગરિકોને ગેરકાયદેસર અથવા અપ્રમાણિત સ્રોતોમાંથી દારૂ ન ખરીદવા અપીલ કરી હતી. " +
  "ઘટનાની ગંભીરતાને ધ્યાનમાં રાખી રાજ્યના ગૃહ વિભાગે તમામ જિલ્લાઓમાં પ્રોહિબિશન " +
  "કાયદાના ચુસ્ત અમલ માટે સૂચના જારી કરી છે.";

const AADHAAR_BODY =
  "દીવ: યુનિક આઇડેન્ટિફિકેશન ઓથોરિટી ઓફ ઇન્ડિયા (UIDAI)ની મુંબઈ પ્રાદેશિક કચેરી દ્વારા " +
  "દીવ ખાતે આધાર નોંધણી અને અપડેટ ઈકોસિસ્ટમ પર વિશેષ તાલીમ કાર્યક્રમ યોજાયો હતો. 24 ઓગસ્ટે " +
  "યોજાયેલી આ તાલીમમાં જૂનાગઢ, અમરેલી, ગીર-સોમનાથ અને ભાવનગરના 60થી વધુ ઓપરેટરોએ ભાગ " +
  "લીધો હતો. " +
  "તાલીમ કાર્યક્રમમાં આધાર નોંધણી પ્રક્રિયા, બાયોમેટ્રિક અપડેટ, અને સામાન્ય ફરિયાદ " +
  "નિવારણ પદ્ધતિઓ અંગે વિગતવાર માર્ગદર્શન આપવામાં આવ્યું હતું. UIDAI અધિકારીઓએ " +
  "ઓપરેટરોને નવીનતમ સોફ્ટવેર અપડેટ્સ અને સુરક્ષા પ્રોટોકોલ અંગે પણ જાણકારી આપી હતી. " +
  "આ પ્રકારના તાલીમ કાર્યક્રમો નિયમિતપણે યોજવામાં આવે છે જેથી ઓપરેટરો નાગરિકોને " +
  "ઝડપી અને ચોકસાઈભરી સેવા આપી શકે. UIDAIના પ્રાદેશિક નિયામકે જણાવ્યું કે દીવ અને " +
  "આસપાસના વિસ્તારોમાં આધાર સંબંધિત સેવાઓની માંગ સતત વધી રહી છે, જેને પહોંચી વળવા " +
  "વધુ કેન્દ્રો શરૂ કરવાની યોજના છે.";

const CBI_BODY =
  "અમદાવાદ: CBI કોર્ટ, અમદાવાદે 21 ઓગસ્ટના રોજ આવકવેરા અધિકારી જરનૈલ બી. સિંઘને લાંચ " +
  "કેસમાં દોષિત ઠેરવી ત્રણ વર્ષની સખત કેદ અને ₹20,000ના દંડની સજા ફટકારી હતી. લગભગ 13 " +
  "વર્ષની ટ્રાયલ બાદ કોર્ટે આરોપીને દોષિત ઠેરવ્યો. " +
  "કોર્ટે પોતાના ચુકાદામાં નોંધ્યું કે ભ્રષ્ટાચાર જાહેર સેવામાં જનતાના વિશ્વાસને નબળો " +
  "પાડે છે અને આવા કૃત્યો માટે કડક સજા આવશ્યક છે. ફરિયાદ પક્ષ તરફથી રજૂ કરાયેલા " +
  "પુરાવાઓ અને સાક્ષીઓની જુબાનીના આધારે કોર્ટે આરોપીને દોષિત ઠેરવ્યો હતો. " +
  "CBIના અધિકારીઓએ જણાવ્યું કે આ ચુકાદો કેન્દ્ર સરકારના ભ્રષ્ટાચાર વિરુદ્ધના " +
  "શૂન્ય-સહિષ્ણુતા અભિગમને પુનઃ સ્થાપિત કરે છે. તપાસ એજન્સીએ છેલ્લા એક વર્ષમાં " +
  "રાજ્યભરમાં આવા અનેક કેસોમાં ઝડપી કાર્યવાહી કરી છે. " +
  "કાનૂની નિષ્ણાતોના મતે, આ પ્રકારના ચુકાદાઓ સરકારી કર્મચારીઓમાં જવાબદારીની ભાવના " +
  "મજબૂત બનાવવામાં મદદરૂપ થાય છે.";

const SAMARTH: StoryText = {
  title: "IITGNમાં સેમિકન્ડક્ટર તાલીમ હબ 'સામર્થ્ય'નો પ્રારંભ",
  kicker: "₹190 કરોડનો પ્રોજેક્ટ, 10,000ને તાલીમ",
  body: SAMARTH_BODY,
};
const PRAG: StoryText = {
  title: "IIT ગાંધીનગર દ્વારા નીતિ-સંશોધન માટે 'પ્રાગ' પહેલનો પ્રારંભ",
  kicker: "ટેકનોલોજી અને શાસનના સંગમ પર નિષ્ણાતોની ચર્ચા, ભૂતપૂર્વ મુખ્ય સચિવો પણ જોડાયા",
  body: PRAG_BODY,
  photoCaption: "IIT ગાંધીનગર ખાતે 'પ્રાગ' પહેલના શુભારંભ પ્રસંગે નિષ્ણાતોની પેનલ ચર્ચા.",
};
const NIFT: StoryText = {
  title: "NIFT ગાંધીનગર ખાતે 24 કલાકની યુનિફોર્મ ડિઝાઇન હેકાથોન",
  kicker: "ITI તાલીમાર્થીઓ માટે નવો યુનિફોર્મ, વિજેતા ટીમને ₹1 લાખનું ઇનામ",
  body: NIFT_BODY,
};
const PM_VISIT: StoryText = {
  title: "વડાપ્રધાન મોદી 25-26 ઓગસ્ટે ગુજરાતની મુલાકાતે",
  kicker: "25-26 ઓગસ્ટે અમદાવાદમાં ₹5,400 કરોડના વિકાસ પ્રોજેક્ટ્સનું લોકાર્પણ",
  body: PM_VISIT_BODY,
};
const UPI: StoryText = {
  title: "UPIના 10 વર્ષ પૂર્ણ",
  kicker: "ડિજિટલ ક્રાંતિ",
  body: UPI_BODY,
};
const RBI: StoryText = {
  title: "RBIની ફોરેક્સ સ્વેપ યોજના",
  body: RBI_BODY,
};
const BHAVNAGAR: StoryText = {
  title: "ભાવનગરમાં ઝેરી દારૂકાંડ: 13નાં મૃત્યુ",
  body: BHAVNAGAR_BODY,
};
const AADHAAR: StoryText = {
  title: "દીવમાં આધાર ઓપરેટરો માટે તાલીમ કાર્યક્રમ",
  body: AADHAAR_BODY,
};
const CBI: StoryText = {
  title: "લાંચ કેસમાં આવકવેરા અધિકારીને ત્રણ વર્ષની જેલ",
  kicker: "CBI કોર્ટ, અમદાવાદનો ચુકાદો; 2013ના ટ્રેપ કેસમાં 13 વર્ષે સજા",
  body: CBI_BODY,
};

/** One real article region (already px, already non-overlapping -- see the
 * file header for how these were derived from the real PDF's own layout).
 * `story` is omitted for pure ad/photo boxes. `photoUrl`/`dropCaption` let a
 * reused story's photo be attached only where the source PDF actually had
 * one, or omitted (text-only reuse) elsewhere -- see file header on reuse. */
function mkArticle(
  id: string,
  page: number,
  box: { x: number; y: number; w: number; h: number },
  type: ArticleType,
  story?: StoryText,
  photoUrl = ""
) {
  return {
    id,
    page,
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    type,
    title: story?.title ?? "",
    kicker: story?.kicker,
    bodyText: story?.body ?? "",
    photoUrl,
    photoCaption: photoUrl ? story?.photoCaption : undefined,
  };
}

const REPLICA_ISSUE: IssueResponse = {
  issueDate: "2026-08-26",
  issueNumber: 212,
  pages: 4,
  articles: [
    // ================= Page 1 =================
    // Real positions from capital_kranti_zone_map.json page 1, cross-checked
    // against the archived content.ts's hand-verified frame groupings
    // (p1-11..p1-43) -- the one page with a human-confirmed ground truth.
    mkArticle("samarth", 1, { x: 59, y: 1144, w: 2219, h: 2051 }, "news", SAMARTH, "/photos/samarth1.jpg"),
    mkArticle("prag", 1, { x: 2328, y: 1139, w: 2219, h: 1991 }, "news", PRAG, "/photos/prag1.jpg"),
    mkArticle("nift", 1, { x: 57, y: 3205, w: 1656, h: 2915 }, "news", NIFT),
    // y nudged from the raw cluster's 758pt to 767pt (SAMARTH's own bottom
    // edge) to remove a ~9px sliver overlap -- PM_VISIT's real headline_L2
    // starts a hair above where SAMARTH's last body column ends in the
    // source, a normal multi-column layout in print, not reproducible as
    // two flat non-overlapping rectangles without this trim.
    mkArticle("pm-visit", 1, { x: 1760, y: 3196, w: 2221, h: 1679 }, "news", PM_VISIT),
    // Real region (source frames p1-38..43: two photos + two ad rects + two
    // brief captions) -- the real page shows two photos with short captions
    // here, not a blank ad panel (confirmed by looking at the actual source
    // page render, not assumed from the frame types alone) -- kept as a
    // real text+photo block (reused AADHAAR copy) rather than an empty ad.
    mkArticle("ad-p1-block", 1, { x: 1750, y: 4879, w: 2792, h: 1235 }, "article", AADHAAR),

    // ================= Page 2 =================
    // Real positions from capital_kranti_zone_map.json page 2 (4 clusters:
    // the Narmada dam story, the page's big MENA/travel lead story, a
    // trailing left-column photo, and the district legal-services story).
    mkArticle("narmada-dam", 2, { x: 75, y: 217, w: 1047, h: 3155 }, "news", RBI),
    // MENA_STORY's real body (source frame idx10) ran to y=1464pt in one
    // narrow column, far past every sibling element (698pt) -- the same
    // "column reused by a later story" pattern found on page 1's PRAG and
    // page 4's XECH; capped to the story's own real extent (its own photo
    // caption position) rather than reaching into legal-services' territory.
    mkArticle("mena", 2, { x: 1194, y: 146, w: 3359, h: 4740 }, "news", UPI, "/photos/upi_chart.png"),
    mkArticle("legal-services", 2, { x: 2328, y: 4917, w: 2220, h: 1218 }, "article", CBI),
    // Real standalone photo (source frame idx18, x14-411pt), width clipped
    // to 280px (from its real 397px) -- its real extent pokes slightly into
    // MENA_STORY's leftmost column, again a real shared-column overlap a
    // flat rectangle can't represent without a small trim.
    mkArticle("ad-p2-photo", 2, { x: 59, y: 3423, w: 1108, h: 2699 }, "ad"),

    // ================= Page 3 =================
    // Real positions from capital_kranti_zone_map.json page 3, corrected
    // after visually comparing against the actual source page render: an
    // earlier version of story-a/story-b's geometry wrongly absorbed a
    // trailing photo element (source idx23) that actually belongs to a
    // separate small ad block near the bottom-left, which stretched both
    // boxes to nearly the full page height -- not how the real page looks
    // (each story ends around 2/3 down the page, with distinct ad content
    // below, matching the corrected boxes here).
    mkArticle("story-a", 3, { x: 59, y: 188, w: 1652, h: 3977 }, "news", BHAVNAGAR),
    mkArticle("story-b", 3, { x: 2896, y: 195, w: 1654, h: 3615 }, "article", AADHAAR),
    mkArticle("story-c", 3, { x: 1761, y: 212, w: 1089, h: 2161 }, "news", NIFT),
    // x1 clipped from the raw union's 819pt to 684pt: story-d's own
    // headline (module4-6) reaches into the same module-6 column story-b
    // occupies higher up the page -- story-d's body columns themselves stay
    // within 684pt, only the headline's real width was trimmed.
    mkArticle("story-d", 3, { x: 1756, y: 2420, w: 1094, h: 3696 }, "article", PM_VISIT),
    // Real small ad block (source idx23, a standalone photo with no nearby
    // headline) below story-a -- the source page shows 2-3 small graphic
    // ads in this exact region.
    mkArticle("ad-p3-block", 3, { x: 63, y: 4189, w: 1638, h: 1931 }, "ad"),

    // ================= Page 4 =================
    // Real positions from capital_kranti_zone_map.json page 4 (6 clusters:
    // a lead story, a thin row of small sponsor-logo photos, a tourism
    // story, a Rotary Club item, a Tiranga Yatra story, and a standalone
    // bottom-left photo).
    mkArticle("xech", 4, { x: 57, y: 150, w: 2222, h: 2592 }, "news", SAMARTH),
    // Real thin banner of ~13 small sponsor/listing photos (source frames
    // idx9-21) plus one section-label headline ("Business News") -- no
    // single editorial story behind it, kept as an ad strip.
    mkArticle("ad-p4-banner", 4, { x: 2335, y: 204, w: 2208, h: 130 }, "ad"),
    mkArticle("mp-tourism", 4, { x: 2328, y: 346, w: 2221, h: 3469 }, "article", PRAG),
    mkArticle("rotary", 4, { x: 631, y: 2757, w: 1647, h: 2055 }, "news", RBI),
    mkArticle("tiranga", 4, { x: 2328, y: 3833, w: 2222, h: 2228 }, "article", CBI),
    // Real standalone photo (source frame idx51, x13-547pt) with no nearby
    // headline in the source -- kept as an ad/photo block, not invented text.
    mkArticle("ad-p4-photo", 4, { x: 53, y: 4834, w: 2225, h: 1227 }, "ad"),
  ],
};

// ---- A 1-page day: just page 1's real stories ----
const ONE_PAGE_ISSUE: IssueResponse = {
  issueDate: "2026-08-27",
  issueNumber: 213,
  pages: 1,
  articles: REPLICA_ISSUE.articles.filter((a) => a.page === 1),
};

// ---- A 2-page day: page 1 + page 2 of the real replica ----
const TWO_PAGE_ISSUE: IssueResponse = {
  issueDate: "2026-08-26",
  issueNumber: 212,
  pages: 2,
  articles: REPLICA_ISSUE.articles.filter((a) => a.page <= 2),
};

// ---- The full 4-page replica of the real source PDF (see file header) ----
const FOUR_PAGE_ISSUE: IssueResponse = REPLICA_ISSUE;

export const FIXTURES = {
  onePage: ONE_PAGE_ISSUE,
  twoPage: TWO_PAGE_ISSUE,
  fourPage: FOUR_PAGE_ISSUE,
} as const;

// PX_PER_PT is exported for scripts/tools cross-checking these coordinates
// against capital_kranti_zone_map.json's raw pt values directly.
export { PX_PER_PT };

/** Which fixture the mock server returns for /api/issue -- override via
 * MOCK_FIXTURE env var (one/two/four) when testing the other cases. Default
 * is the full 4-page replica of the real source PDF (fourPage) -- that's
 * now the most complete/realistic fixture, so it's what the website and PDF
 * generator show without any special setup. */
export function selectFixture(): IssueResponse {
  const key = process.env.MOCK_FIXTURE?.trim().toLowerCase();
  if (key === "one") return FIXTURES.onePage;
  if (key === "two") return FIXTURES.twoPage;
  return FIXTURES.fourPage;
}
