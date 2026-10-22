# કેપિટલ ક્રાંતિ ન્યૂઝરૂમ — માર્ગદર્શિકા
*Capital Kranti Newsroom — the one-page guide*

## એક વખત: સ્થાપના (Once: setting it up)

**Windows:** `windows\Install Capital Kranti.cmd` પર ડબલ-ક્લિક કરો. *(Double-click it.)*
**Mac:** `mac/Install Capital Kranti.command` પર ડબલ-ક્લિક કરો.

સ્થાપના દરમિયાન *(During setup)*:
1. તે Node.js અને Git લાવે છે (જો ન હોય તો). *It installs Node.js and Git if they're missing.*
2. **ગોપિકા ફોન્ટવાળું ફોલ્ડર** પસંદ કરવાનું કહે છે. *It asks for the folder with the Gopika fonts.*
3. GitHub માં એક વખત સાઇન ઇન કરવાનું કહે છે (વેબસાઇટ પર પ્રકાશન માટે). *It asks you to sign in to GitHub once, for the Publish button.*
4. ડેસ્કટોપ પર **Capital Kranti** બનાવે છે અને ન્યૂઝરૂમ ખોલે છે. *It puts **Capital Kranti** on the desktop and opens the newsroom.*

પછી ન્યૂઝરૂમમાં **સેટિંગ્સ** માં OpenRouter key એક વખત નાખો. *Then, in the newsroom's **Settings**, paste the OpenRouter key once.*

## દરરોજ (Every day)

કમ્પ્યુટર ચાલુ રાખો: **રાત્રે 8 વાગ્યે** પેપર આપમેળે બને છે. *Leave the computer on: the paper makes itself at **8 PM**.*

1. **Capital Kranti** ખોલો → **આજે (Today)**. પાંચેય પગલાં "થયું" બતાવે એટલે પેપર તૈયાર.
   *Open **Capital Kranti** → **Today**. When all five steps say "done", the paper is ready.*
2. **પાનાં (Pages)** માં ચાર પાનાં જુઓ. કોઈ સમાચાર પર ક્લિક કરો તો તે સુધારી શકાય.
   *Look over the four pages in **Pages**. Click a story to edit it.*
3. **લેખ (Stories)**: શીર્ષક, લેખ, ફોટો કે મહત્વ બદલો, અથવા સમાચાર કાઢી નાખો. દરેક ફેરફાર પછી પાનાં ફરી ગોઠવાય છે (થોડી મિનિટ).
   *In **Stories**, change a headline, the text, the photo or the rank, or leave a story out. The pages are laid out again after each change (a few minutes).*
   "From Hindi" લખેલા સમાચાર હિન્દીમાંથી અનુવાદિત છે: બાજુમાં મૂળ હિન્દી દેખાય છે. *Stories marked "From Hindi" were translated; the Hindi original is shown beside them.*
4. **આજે (Today)** → **મંજૂર કરી પ્રકાશિત કરો**: વેબસાઇટ પર પેપર મુકાય છે. **PDF છાપવા માટે**: પ્રિન્ટર માટેની ફાઇલ.
   *Back in **Today**: **Approve & Publish** puts the paper on the website. **Print PDF** is the file for the printer.*

## જાહેરાત (Ads)

**જાહેરાત (Ads)**: જાહેરાતની છબી, પહોળાઈ (કૉલમ), ઊંચાઈ (સેમી), પાનું અને તારીખો આપી **બુક કરો**.
*Choose the ad image, its width in columns, height in cm, the page and the dates, then **Book it**.*

## કંઈ ખોટું થાય તો (If something goes wrong)

| જોવા મળે છે *(You see)* | કરો *(Do)* |
|---|---|
| "The Capital Kranti engine isn't answering" | ડેસ્કટોપ પરથી **Capital Kranti** ખોલો, કે કમ્પ્યુટર ફરી શરૂ કરો. *Open the app, or restart the computer.* |
| એક પગલું "અટક્યું" *(a step says "failed")* | **Retry** દબાવો. *Press Retry.* PIB બંધ હોય તો થોડી વાર પછી. *If PIB is down, later.* |
| "તપાસ બાકી · Needs a look" | **પાનાં** માં જુઓ. ઠીક લાગે તો **તો પણ પ્રકાશિત કરો**. *Look at the pages; if they're fine, Publish anyway.* |
| 8 વાગ્યે પેપર ન બન્યું *(no paper at 8 PM)* | કમ્પ્યુટર બંધ/સ્લીપમાં હતું: **હમણાં ચલાવો (Run now)**. *The computer was off or asleep: press Run now.* |

**નવી આવૃત્તિ (Updates):** Windows: `windows\launch.ps1 -Update`; Mac: `node scripts/launch.mjs --update` (in the app's folder).
**બેકઅપ (Backups):** દરરોજ આપમેળે, `backups` ફોલ્ડરમાં (છેલ્લા 30 દિવસ). *Every day, automatically, in the `backups` folder (the last 30 days).*

**સમાચાર ક્યાંથી? (Where the news comes from):** PIB અમદાવાદના ગુજરાતી પ્રેસ રિલીઝ; તે ઓછા હોય ત્યારે PIB દિલ્હીના હિન્દી રિલીઝ, ગુજરાતીમાં અનુવાદ કરીને. *PIB Ahmedabad's Gujarati releases; when those don't fill the paper, PIB Delhi's Hindi releases, translated into Gujarati.*
