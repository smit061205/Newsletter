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
  "align": "left",             // left | center | right | justify (optional, default left)
  "hScale": 0.94,              // optional horizontal squeeze, 1 = none
  "letterSpacing": 0,          // optional, px
  "vAlign": "top",             // top | middle | bottom (optional)
  "indent": 59.0 }             // optional first-line indent of each paragraph, px
```

- **Paragraphs:** a blank line (`"\n\n"`) starts a new paragraph; a single `"\n"` is a forced line break.
- **Wrapping** is the one thing the frontend does itself. It breaks the text at spaces within `width`, using the given font, size, `hScale` and letter spacing. **Size your boxes so the text fits.** The frontend never shrinks, clips or moves text. Text that runs half a line or more past `height` is drawn anyway and reported as a `text-overflow` warning.
- **`hScale`** narrows or widens the glyphs without changing their height. The box still occupies exactly `width`.

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

Background panels, boxes around stories, the edition bar's coloured field. `fill`, `stroke` and `radius` are all optional.

### line

```jsonc
{ "id": "p1-rule3", "kind": "line", "x1": 62.0, "y1": 3180.0, "x2": 4550.0, "y2": 3180.0,
  "color": "#231f20", "width": 4.2, "dash": [25, 12] }   // dash optional
```

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
- a text element whose `font` isn't declared in `fonts[]`;
- duplicate element ids, or duplicate page numbers.

## What is drawn but reported (warnings)

| Warning | Meaning |
|---|---|
| `text-overflow` | The text needs more height than the box gives it (the amount is reported in px). |
| `off-page` | The element extends past the page edge (clipped when printed). |
| `image-failed` | The image URL didn't load. |
| `font-failed` | The font URL didn't load, or the text isn't set in its declared font. |
| `empty-text` | A text element with no text. |

The website lists these above the pages. `GET /api/pdf?warnings=1` returns them as JSON, and the PDF response carries their count in an `X-Plot-Warnings` header.
