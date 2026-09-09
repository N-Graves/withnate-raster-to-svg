import { describe, expect, it } from "vitest";
import {
  ARTWORK,
  CUTTING,
  PRESETS,
  SIZE_WARNING_BYTES,
  analyseSvg,
  noticesFor,
  optionsFor,
} from "../src/trace.js";

const svgOf = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`;

describe("presets", () => {
  it("carries the settings the bake-off actually chose", () => {

    expect(ARTWORK.colorPrecision).toBe(8);
    expect(ARTWORK.layerDifference).toBe(4);
    expect(ARTWORK.filterSpeckle).toBe(4);
    expect(ARTWORK.cornerThreshold).toBe(40);
    expect(ARTWORK.pathPrecision).toBe(8);
  });

  it("does not exceed the library's maximum colour precision", () => {
    expect(ARTWORK.colorPrecision).toBeLessThanOrEqual(8);
  });

  it("traces a cutting file in one colour, not many layers", () => {

    expect(CUTTING.clustering).toBe("bw");
    expect(ARTWORK.clustering).toBe("color-cluster");
  });

  it("filters harder for cutting, because every speck becomes a cut", () => {
    expect(CUTTING.filterSpeckle!).toBeGreaterThan(ARTWORK.filterSpeckle!);
  });

  it("hands back a copy, so a caller cannot mutate the shared preset", () => {
    const a = optionsFor("artwork");
    a.colorPrecision = 2;
    expect(optionsFor("artwork").colorPrecision).toBe(8);
    expect(ARTWORK.colorPrecision).toBe(8);
  });

  it("exposes both presets with a note explaining each", () => {
    expect(PRESETS).toHaveLength(2);
    for (const p of PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.note.length).toBeGreaterThan(20);
    }
  });
});

describe("analyseSvg", () => {
  it("counts paths", () => {
    expect(analyseSvg(svgOf('<path d="M0 0"/><path d="M1 1"/>')).pathCount).toBe(2);
  });

  it("catches an SVG that merely wraps a bitmap", () => {

    expect(analyseSvg(svgOf('<image href="photo.png"/>')).containsRaster).toBe(true);
    expect(analyseSvg(svgOf('<image href="data:image/png;base64,AAAA"/>')).containsRaster).toBe(true);
  });

  it("catches an embedded raster hidden in a fill or a pattern", () => {

    expect(
      analyseSvg(svgOf('<defs><pattern><image xlink:href="data:image/jpeg;base64,x"/></pattern></defs><path d="M0 0"/>'))
        .containsRaster,
    ).toBe(true);
  });

  it("passes a genuine path-only trace", () => {
    const a = analyseSvg(svgOf('<path d="M0 0 L10 10 Z" fill="#832305"/>'));
    expect(a.containsRaster).toBe(false);
    expect(a.pathCount).toBe(1);
  });

  it("measures bytes as encoded, not as characters", () => {

    const withUnicode = svgOf("<title>café — ★</title>");
    expect(analyseSvg(withUnicode).bytes).toBeGreaterThan(withUnicode.length);
  });

  it("flags a file large enough to hang whatever opens it", () => {
    const big = svgOf(`<path d="${"M0 0 ".repeat(SIZE_WARNING_BYTES / 5)}"/>`);
    expect(analyseSvg(big).oversized).toBe(true);
    expect(analyseSvg(svgOf('<path d="M0 0"/>')).oversized).toBe(false);
  });
});

describe("noticesFor", () => {
  const clean = { bytes: 40_000, pathCount: 120, containsRaster: false, oversized: false };

  it("says nothing when there is nothing worth saying", () => {

    expect(noticesFor(clean, 30_000)).toEqual([]);
  });

  it("leads with the embedded-bitmap failure, because it invalidates the output", () => {
    const notices = noticesFor({ ...clean, containsRaster: true }, 30_000);
    expect(notices[0]).toContain("bitmap embedded");
  });

  it("warns about size, and says what to do about it", () => {
    const n = noticesFor({ ...clean, bytes: 40_000_000, oversized: true }, 3_000_000);
    expect(n.some((s) => s.includes("40 MB"))).toBe(true);
    expect(n.some((s) => s.includes("cutting preset"))).toBe(true);
  });

  it("warns when the path count would defeat a cutting machine", () => {
    const n = noticesFor({ ...clean, pathCount: 45_000 }, 30_000);
    expect(n.some((s) => s.includes("45,000"))).toBe(true);
  });

  it("explains a big-but-not-huge result rather than alarming about it", () => {
    const n = noticesFor({ ...clean, bytes: 900_000 }, 50_000);
    expect(n.some((s) => s.includes("not a compression format"))).toBe(true);
  });

  it("does not repeat the size point twice for one file", () => {

    const n = noticesFor({ ...clean, bytes: 40_000_000, oversized: true }, 100_000);
    expect(n.filter((s) => s.includes("not a compression format"))).toHaveLength(0);
  });
});
