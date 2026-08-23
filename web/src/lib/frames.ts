import raw from "./frames.json";
import { pt, type Pt } from "./gridSpec";

export type FrameType = "chrome" | "masthead" | "photo" | "body" | "headline";

export interface Frame {
  id: string;
  type: FrameType;
  x0: Pt;
  y0: Pt;
  x1: Pt;
  y1: Pt;
  label: string;
  fontSizePt?: Pt;
  gridSnapped: boolean;
  moduleStart?: number;
  moduleEnd?: number;
}

// Single source of truth for both the React preview and the pdf-lib export script.
// The .json file is read directly by the Node export script too -- do not fork this data.
export const page1Frames: Frame[] = (raw.frames as Array<Record<string, unknown>>).map((f) => ({
  ...(f as object),
  x0: pt(f.x0 as number),
  y0: pt(f.y0 as number),
  x1: pt(f.x1 as number),
  y1: pt(f.y1 as number),
  fontSizePt: f.fontSizePt !== undefined ? pt(f.fontSizePt as number) : undefined,
})) as Frame[];
