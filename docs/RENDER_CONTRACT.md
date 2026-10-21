# Capital Kranti render contract (backend → frontend)

The backend decides the whole layout. The frontend receives one JSON document per issue, checks it, and plots every element exactly where the backend put it, on a blank page of the size the backend gave. It then shows the result on the website and prints the PDF from that same rendering.

The frontend never moves, resizes, reflows or restyles anything.

- **Schema (source of truth):** `web/src/lib/contract.ts`. It is a Zod schema, so it is also the TypeScript type.
- **Plotter:** `web/src/lib/plot.ts`
- **PDF:** `web/src/lib/pdf.ts` (headless Chromium)
- **Worked example:** `web/src/mocks/issue-2026-08-08.json`, the real 8 August 2026 issue with every element at its printed position.

## Units

Every length is in **px at the issue's `dpi`**. That covers positions, widths and heights, font sizes, line heights, stroke widths, indents and letter spacing. We agreed on `dpi: 300`, so 1 px = 0.24 pt, and a 13 pt font is `size: 54.17`. The origin is the page's top-left corner, with y increasing downwards.

## Document

```jsonc
{
  "issueDate": "2026-08-08",
  "issueNumber": 196,
  "dpi": 300,
  "fonts": [
    { "id": "hind-regular", "url": "https://cdn.example/fonts/HindVadodara-Regular.ttf", "weight": 400 },
    { "id": "hind-bold",    "url": "https://cdn.example/fonts/HindVadodara-Bold.ttf",    "weight": 700 }
  ],
  "pages": [
    {
      "number": 1,
      "width": 4606.2, "height": 6200.8,      // the blank paper; any size is fine
      "background": "#ffffff",               // optional, default white
      "elements": [ /* drawn in this order: later elements on top */ ]
    }
  ]
}
```

## Elements

Every element has a unique `id`, which must be unique across the whole issue. It can also carry an `articleId`, which groups elements into one story. The frontend uses `articleId` only for review and QA, never for layout.

### text

```jsonc
{ "id": "handloom-t0", "kind": "text", "articleId": "handloom",
  "x": 2332.5, "y": 1135.9, "width": 2214.0, "height": 720.0,
  "text": "વડાપ્રધાન શ્રી નરેન્દ્રભાઈ મોદીએ ...",
  "font": "hind-bold",         // a fonts[].id
  "size": 128.4,               // px
  "lineHeight": 180.0,         // px, baseline to baseline
  "color": "#231f20",          // optional, default black
  "align": "left",             // left | center | right | justify | justify-all (optional, default left)
  "hScale": 0.94,              // optional horizontal squeeze, 1 = none
  "letterSpacing": 0,          // optional, px
  "vAlign": "top",             // top | middle | bottom (optional)
  "indent": 59.0 }             // optional first-line indent of each paragraph, px
```

- **Paragraphs:** a blank line (`"\n\n"`) starts a new paragraph; a single `"\n"` is a forced line break.
- **Your own line breaks:** in `justify` text, a line ended by `"\n"` is stretched to the full width, like a printed line. So you can send the exact lines you set, and the frontend won't re-wrap them. A paragraph's last line is left alone, unless the text ends with `"\n"` (a paragraph that carries on into the next column).
- **`justify-all`** stretches every line, the last one too, e.g. a headline set flush to both edges.
- **Wrapping** is the one thing the frontend does itself, for lines you don't break yourself. It breaks the text at spaces within `width`, using the given font, size, `hScale` and letter spacing. **Size your boxes so the text fits.** The frontend never shrinks, clips or moves text. Text that runs half a line or more past `height` is drawn anyway and reported as a `text-overflow` warning.
- **`hScale`** narrows or widens the glyphs without changing their height. The box still occupies exactly `width`.
- **Mixed fonts in one block:** `text` can be a list of runs instead of a string. Each run can set its own `font`, `size` and `color`; anything it leaves out comes from the element. Line and paragraph breaks work across runs.

  ```jsonc
  "text": [
    { "text": "આવૃત્તિએ " },
    { "text": "NRI Achievers", "font": "serif-regular", "size": 54.17 },
    { "text": " Awards ના વધતા જતા\nવૈશ્વિક વારસામાં" }
  ]
  ```

  `hScale` applies to the whole element. If one run needs a different squeeze (an English word in a condensed Gujarati headline), send it as its own element.

### image

```jsonc
{ "id": "handloom-photo0", "kind": "image", "articleId": "handloom",
  "x": 2328.1, "y": 1843.8, "width": 1150.2, "height": 766.7,
  "url": "https://cdn.example/issues/2026-08-08/handloom-1.jpg",
  "fit": "cover" }             // cover | contain | fill (optional, default cover)
```

Photos, ad creatives, the masthead artwork, logos: anything that is a picture.

### rect

```jsonc
{ "id": "p2-label", "kind": "rect", "x": 67.3, "y": 212.2, "width": 1073.3, "height": 124.4,
  "fill": "#231f20", "stroke": "#00aeef", "strokeWidth": 8.5, "radius": 31.1 }
```

Background panels, boxes around stories, the edition bar's coloured field. `fill`, `stroke` and `radius` are all optional. The stroke is centred on the rectangle's edge, as in PDF and SVG, so half of it lies outside `x`/`y`/`width`/`height`.

### line

```jsonc
{ "id": "p1-rule3", "kind": "line", "x1": 62.0, "y1": 3180.0, "x2": 4550.0, "y2": 3180.0,
  "color": "#231f20", "width": 4.2, "dash": [25, 12] }   // dash optional
```

### path

```jsonc
{ "id": "p2-label", "kind": "path", "d": "M75.0 212.0 C70.2 212.0 67.3 215.6 67.3 220.0 L67.3 328.6 ... Z",
  "fill": "#231f20", "stroke": "#231f20", "strokeWidth": 6.0 }   // fill, stroke optional
```

Any vector shape, such as a rounded label box or an ornament, as SVG path data in page coordinates (contract px). Use absolute commands only: `M`, `L`, `C`, `Q`, `Z`.

## Placing text exactly (pixel precision)

The plotter draws a text element's first line box with its top at `y`. Where the letters sit inside that line depends on the font, so to put a line's **baseline** exactly where you want it, compute `y` from the font's own metrics. These are measured against Chromium, which draws both the website and the PDF:

```
ascent, descent  = the font's OS/2 typo metrics if it sets USE_TYPO_METRICS, else hhea   (in em)
s  = size × 96/dpi,  L = lineHeight × 96/dpi                                 (CSS px)
a  = round(ascent × s),  d = round(descent × s)
offset = a + floor((L − a − d) / 2)                                          (CSS px, whole)
printed baseline = round(top) + offset + 1                                   (CSS px; Chromium prints lines on whole CSS px)
⇒ y = round(baseline × 96/72 − offset − 1) × dpi/96                          (baseline in pt)
```

Baselines land on a 0.75 pt grid, so any line is within 0.375 pt of where you asked. For the closest match to a design, send **one element per printed line**, each `justify-all`, as wide as the printed line and placed at its own baseline. Then both edges and the baseline land where you put them, whatever the font's widths. The 8 August replica does this for all 1,208 of its lines, and `scripts/replica/line_diff.py` checks every line against the source paper: baselines within 0.37 pt, and 99% of edges within 0.72 pt.

A run in another font or size never changes where its line's baseline sits; the element's `lineHeight` alone sets the line.

## Page chrome

The masthead, edition bar (date, issue number), running headers, page numbers and footer are ordinary elements, usually an image for the fixed artwork plus text elements for the date and number. There are no special cases on the frontend.

## Fonts

- `url` must be reachable by the browser and by the PDF printer. Either serve fonts from the same origin as the frontend, or send `Access-Control-Allow-Origin` (fonts are CORS-restricted).
- TTF, OTF and WOFF2 all work.
- A font that fails to load is reported as a `font-failed` warning, and the text falls back to a system font.

## What fails validation (nothing is drawn; the error names the field)

- a missing required field, a wrong type, or a non-finite number;
- a negative width, height or size;
- an unknown element `kind`;
- a text element, or one of its runs, whose `font` isn't declared in `fonts[]`;
- duplicate element ids, or duplicate page numbers.

## What is drawn but reported (warnings)

| Warning | Meaning |
|---|---|
| `text-overflow` | The text needs more height than the box gives it (the amount is reported in px). |
| `off-page` | The element extends past the page edge (clipped when printed). |
| `image-failed` | The image URL didn't load. |
| `font-failed` | The font URL didn't load, or the text isn't set in its declared font. |
| `empty-text` | A text element with no text. |
| `overlap` | Text whose letters run into other text, an image or a rule. |

The website lists these above the pages. `GET /api/pdf?warnings=1` returns them as JSON, and the PDF response carries their count in an `X-Plot-Warnings` header.
