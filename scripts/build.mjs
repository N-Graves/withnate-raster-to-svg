import { build } from "esbuild";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const banner = `/*! ${pkg.name} v${pkg.version} - ${pkg.license}
 * ${pkg.homepage}
 * Runs entirely in the browser. No network requests except the local .wasm.
 */`;

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

const common = {
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  metafile: true,
};

const page = await build({
  ...common,
  entryPoints: ["src/index.ts"],
  outfile: "dist/raster-to-svg.js",
  banner: { js: banner },
});

const worker = await build({
  ...common,
  entryPoints: ["src/worker.ts"],
  outfile: "dist/raster-to-svg.worker.js",
  banner: { js: banner },
});

await build({
  ...common,
  metafile: false,
  entryPoints: ["src/style.css"],
  outfile: "dist/raster-to-svg.css",
  banner: { css: banner },
});

await copyFile(
  new URL("../vendor/vtracer_wasm_bg.wasm", import.meta.url),
  new URL("../dist/vtracer_wasm_bg.wasm", import.meta.url),
);

const pageBytes = page.metafile.outputs["dist/raster-to-svg.js"].bytes;
const workerBytes = worker.metafile.outputs["dist/raster-to-svg.worker.js"].bytes;
const wasmBytes = (await stat(new URL("../dist/vtracer_wasm_bg.wasm", import.meta.url))).size;
const cssBytes = (await stat(new URL("../dist/raster-to-svg.css", import.meta.url))).size;

await writeFile(
  new URL("../dist/BUILD.txt", import.meta.url),
  [
    `${pkg.name} v${pkg.version}`,
    "",
    `raster-to-svg.js          ${pageBytes} bytes   the page script`,
    `raster-to-svg.css         ${cssBytes} bytes`,
    `raster-to-svg.worker.js   ${workerBytes} bytes   the tracer, started on first use`,
    `vtracer_wasm_bg.wasm      ${wasmBytes} bytes   fetched by the worker on first use`,
    "",
    "All four go in the site's assets directory. The page script has to be told",
    "where the last two are, because a path hard-coded in the bundle could not",
    "be cache-busted:",
    "",
    '  <div data-rv data-rv-worker="/assets/raster-to-svg.worker.js?v=..."',
    '       data-rv-wasm="/assets/vtracer_wasm_bg.wasm?v=...">',
    "",
    "The page pays only for raster-to-svg.js unless somebody traces something.",
    "",
    "The site's Content-Security-Policy will need script-src 'wasm-unsafe-eval',",
    "worker-src 'self' and connect-src 'self'. Without the first, this fails",
    "SILENTLY - nothing in the console, no output at all.",
    "",
  ].join("\n"),
);

console.log(
  `built  page ${pageBytes}B  worker ${workerBytes}B  css ${cssBytes}B  wasm ${wasmBytes}B`,
);
