# The website's UI/UX: what we take from whom (26 Oct 2026)

We study three newsrooms' open frontends and borrow ideas, never their code.

| From | What we take | Where it lives |
| --- | --- | --- |
| **Washington Post (WPDS)** | design tokens (4px spacing steps, type scale, 2–4px corners, shadows, 0.1–0.5s motion); loading bar, reading bar, skeletons, page transitions; byline block, full-screen photo, read-also box | `site/app/globals.css` tokens, `components/NavProgress`, `ReadProgress`, `Skeleton`, `PhotoZoom` |
| **The Guardian (dotcom-rendering)** | **boost levels**: the lead's size follows how big the news is. Normal news sits beside its photo, bigger news gets a bigger headline, and the biggest takes the photo across the top. Section layouts chosen by how many stories there are | `boostOf()` in `components/cards.tsx` (engine importance 7.5 / 9.5 / 11); `WideBox` and `SmallBox` in `views/Home.tsx` |
| **BBC World Service (Simorgh: BBC ગુજરાતી, हिन्दी)** | taller line heights for Indic scripts; a thick focus ring with a light halo for keyboard users; the WhatsApp channel box; light pages for cheap phones and slow networks | `:focus-visible` in `globals.css`; `Join` card |

Rules that come with it:
- Rules (lines) run exactly as wide as the content. Header icons line up with the page's edges.
- A row of cards shows photos only when every card in it has one, so the headlines line up.
- An older printed paper is called "the latest", never "today's".
- CI's accessibility check (`site/test/a11y.mjs`, WCAG 2 AA) fails on any serious problem.

Next from the same study, not built yet:
- "most read", once the site counts readers;
- an offline page and an installable app (BBC's service worker);
- links to the same event's other stories under the lead (the Guardian's "supporting content").
