// Which characters a font has: its cmap table (formats 4 and 12), read from
// the file. The build checks every printed character against its font's,
// so a letter no font of the paper's has -- set by the browser in some
// fallback face, or not at all -- stops the issue instead of printing wrong.
export function cmapCoverage(b: Buffer): Set<number> {
  const n = b.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < n; i++) if (b.toString("latin1", 12 + i * 16, 16 + i * 16) === "cmap") cmap = b.readUInt32BE(12 + i * 16 + 8);
  const out = new Set<number>();
  if (cmap < 0) return out;
  const subtables = b.readUInt16BE(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const at = cmap + b.readUInt32BE(cmap + 4 + i * 8 + 4);
    const format = b.readUInt16BE(at);
    if (format === 4) {
      const segs = b.readUInt16BE(at + 6) / 2;
      const ends = at + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = b.readUInt16BE(ends + s * 2), start = b.readUInt16BE(starts + s * 2);
        const delta = b.readInt16BE(deltas + s * 2), range = b.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const glyph = range === 0 ? (c + delta) & 0xffff : b.readUInt16BE(ranges + s * 2 + range + (c - start) * 2);
          if (glyph !== 0) out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = b.readUInt32BE(at + 12);
      for (let g = 0; g < groups; g++) {
        const start = b.readUInt32BE(at + 16 + g * 12), end = b.readUInt32BE(at + 20 + g * 12);
        for (let c = start; c <= end && c - start < 0x30000; c++) out.add(c);
      }
    }
  }
  return out;
}
