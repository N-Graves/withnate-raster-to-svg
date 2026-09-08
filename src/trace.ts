/**
 * Tracing settings, and what to say about the result.
 *
 * Pure. The tracing itself happens in WebAssembly in a worker; everything with
 * a judgement in it is here, so it can be tested without a browser.
 */

export interface TraceOptions {
  clustering?: "color-cluster" | "bw";
  mode?: "pixel" | "polygon" | "spline";
  filterSpeckle?: number;
  colorPrecision?: number;
  layerDifference?: number;
  cornerThreshold?: number;
  lengthThreshold?: number;
  maxIterations?: number;
  spliceThreshold?: number;
  pathPrecision?: number;
}

/**
 * Settings chosen by a real SSIM bake-off, run on this business's own artwork
 * against the alternatives.
 *
 * `colorPrecision` 8 with `layerDifference` 4 - up from the library's own
 * defaults of 6 and 16 - roughly doubled fidelity on photographic content:
 * SSIM 0.907 to 0.948 on a gradient-heavy source, and 0.663 to 0.860 on a
 * detail-dense one. 8 is the maximum the library accepts; below about 2 on
 * layerDifference the layer count explodes for no visible gain.
 *
 * `filterSpeckle` 4 drops single-pixel noise that would otherwise become
 * hundreds of tiny paths a cutting machine would try to follow.
 */
export const ARTWORK: Readonly<TraceOptions> = Object.freeze({
  clustering: "color-cluster",
  mode: "spline",
  filterSpeckle: 4,
  colorPrecision: 8,
  layerDifference: 4,
  cornerThreshold: 40,
  lengthThreshold: 2,
  maxIterations: 15,
  spliceThreshold: 30,
  pathPrecision: 8,
});

/**
 * Single-colour trace, which is what a blade actually wants.
 *
 * A cutting machine follows one outline; it has no use for forty colour
 * layers stacked on top of each other. Binary clustering gives closed paths
 * around the dark areas and nothing else, and the higher speckle filter is
 * there because every stray dot in this mode becomes a separate cut.
 */
export const CUTTING: Readonly<TraceOptions> = Object.freeze({
  clustering: "bw",
  mode: "spline",
  filterSpeckle: 8,
  cornerThreshold: 40,
  lengthThreshold: 2,
  maxIterations: 15,
  spliceThreshold: 30,
  pathPrecision: 6,
});

export type PresetId = "artwork" | "cutting";

export const PRESETS: ReadonlyArray<{ id: PresetId; label: string; note: string; options: Readonly<TraceOptions> }> =
  [
    {
      id: "artwork",
      label: "Colour artwork",
      note: "Keeps the colours, as stacked layers. Best for illustration and clipart.",
      options: ARTWORK,
    },
    {
      id: "cutting",
      label: "Cutting file",
      note: "One colour, clean closed outlines. What a Cricut or Silhouette actually needs.",
      options: CUTTING,
    },
  ];

export const optionsFor = (id: PresetId): TraceOptions => ({
  ...(id === "cutting" ? CUTTING : ARTWORK),
});

// ------------------------------------------------------------- the result

/** A detail-dense photograph reached 76MB even at tuned settings. */
export const SIZE_WARNING_BYTES = 15_000_000;

export interface SvgAnalysis {
  bytes: number;
  pathCount: number;
  /** True if the SVG merely wraps the original bitmap. */
  containsRaster: boolean;
  /** True if it is large enough to hang whatever opens it. */
  oversized: boolean;
}

/**
 * Look at what came back.
 *
 * The raster check is the one that matters and it is the whole positioning of
 * this tool. Plenty of converters hand back an SVG with the original bitmap
 * embedded inside it: it opens, it looks right, and it is completely useless
 * for cutting because there is no outline for the blade to follow. Asserting
 * that our own output has none is cheap, and it is checked on every trace
 * rather than only in the tests.
 */
export const analyseSvg = (svg: string): SvgAnalysis => {
  const bytes = new TextEncoder().encode(svg).length;
  return {
    bytes,
    pathCount: (svg.match(/<path\b/g) ?? []).length,
    containsRaster: /<image\b/i.test(svg) || /data:image\//i.test(svg),
    oversized: bytes >= SIZE_WARNING_BYTES,
  };
};

const round = (n: number, dp = 1): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export const formatBytes = (n: number): string =>
  n >= 1_000_000 ? `${round(n / 1_000_000)} MB` : `${Math.round(n / 1000)} KB`;

/**
 * What to tell the person, in order of how much it matters.
 *
 * Returns an empty list when there is nothing worth saying, rather than
 * manufacturing reassurance nobody asked for.
 */
export const noticesFor = (analysis: SvgAnalysis, sourceBytes: number): string[] => {
  const out: string[] = [];
  if (analysis.containsRaster) {
    out.push(
      "This SVG has a bitmap embedded in it rather than real paths, which should not happen — please report it, because a file like that is no use for cutting.",
    );
  }
  if (analysis.oversized) {
    out.push(
      `At ${formatBytes(analysis.bytes)} this is large enough to be slow, or to hang, in whatever you open it in. Detail-dense photographs do this. A simpler source, or the cutting preset, gives a far smaller file.`,
    );
  }
  if (analysis.pathCount > 20_000) {
    out.push(
      `${analysis.pathCount.toLocaleString()} separate paths. A cutting machine will struggle with that — raise the speckle filter or start from flatter artwork.`,
    );
  }
  if (analysis.bytes > sourceBytes * 8 && !analysis.oversized) {
    out.push(
      "The SVG is a good deal bigger than the image it came from, which is normal for photographic sources — vector is not a compression format.",
    );
  }
  return out;
};
