

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




export const SIZE_WARNING_BYTES = 15_000_000;

export interface SvgAnalysis {
  bytes: number;
  pathCount: number;
  
  containsRaster: boolean;
  
  oversized: boolean;
  
  containsActiveContent: boolean;
}


const utf8Length = (s: string): number => {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i += 1;
    } else n += 3;
  }
  return n;
};

const countMatches = (s: string, source: string): number => {
  const re = new RegExp(source, "g");
  let n = 0;
  while (re.exec(s) !== null) n += 1;
  return n;
};

const ACTIVE_CONTENT = /<script\b|\son\w+\s*=|javascript:/i;


export const analyseSvg = (svg: string): SvgAnalysis => {
  const bytes = utf8Length(svg);
  return {
    bytes,
    pathCount: countMatches(svg, "<path\\b"),
    containsRaster: /<image\b/i.test(svg) || /data:image\//i.test(svg),
    oversized: bytes >= SIZE_WARNING_BYTES,
    containsActiveContent: ACTIVE_CONTENT.test(svg),
  };
};

const round = (n: number, dp = 1): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export const formatBytes = (n: number): string =>
  n >= 1_000_000 ? `${round(n / 1_000_000)} MB` : `${Math.round(n / 1000)} KB`;


export const noticesFor = (analysis: SvgAnalysis, sourceBytes: number): string[] => {
  const out: string[] = [];
  if (analysis.containsActiveContent) {
    out.push(
      "This SVG carries something that could run, which the tracer should never produce — it has not been drawn on screen, and it should be reported rather than opened.",
    );
  }
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
