# withnate-raster-to-svg

Turn a PNG or JPEG into a real vector SVG — actual path nodes, ready for Cricut, Silhouette or any
cutting machine.

**Runs entirely in the browser. Your file never leaves your device.** The tracer is WebAssembly,
loaded on demand and vendored locally — there is no CDN and no server.

MIT licensed.

## Real paths, not a raster in a wrapper

The trap in this category is that plenty of "converters" hand back an SVG with the original bitmap
embedded inside it. It opens, it looks right, and it is **completely useless for cutting**, because
there is no outline for the blade to follow.

Every path here is traced geometry, and the tool checks its own output on every run rather than only
in the tests — the result panel says `real paths, no bitmap` or it says the opposite and asks you to
report it.

## Two presets, and the difference is real

| | Result on a four-colour test image |
|---|---|
| **Colour artwork** | 3,692 bytes, 4 distinct fills, stacked colour layers |
| **Cutting file** | 1,906 bytes, **1 fill**, closed outlines only |

A blade follows one outline; forty stacked colour layers are no use to it. That is what the second
preset is for, and it filters speckle harder because in single-colour mode every stray dot becomes a
separate cut.

## Settings chosen by measurement

The colour preset carries the parameters from a real SSIM bake-off run on this business's own
artwork:

| Parameter | Value | Why |
|---|---|---|
| `colorPrecision` | 8 | With `layerDifference` 4 — up from the library's own defaults of 6 and 16 — roughly **doubled** measured fidelity: SSIM 0.907 → 0.948 on gradient-heavy art, 0.663 → 0.860 on detail-dense art. 8 is the library maximum. |
| `layerDifference` | 4 | As above. Below about 2 the layer count explodes for no visible gain. |
| `filterSpeckle` | 4 | Drops single-pixel noise that would otherwise become hundreds of unusable paths. |
| `cornerThreshold` | 40 | |
| `pathPrecision` | 8 | |

There is a test pinning each, because if they drift the tuning is lost and nothing would say so.

## Two hard limits, stated on the page

⚠️ **Flat fills only. No gradient support at all** — confirmed upstream by tracing a pure gradient at
maximum precision and getting flat bands back. Photographic gradients will always band. This is a
property of the tracer, not a setting to turn up.

⚠️ **Detail-dense sources produce very large files.** A real photograph reached 76MB even at tuned
settings. There is a warning at 15MB, because a file that size will hang whatever you open it in.

Neither is a reason not to use it. They are reasons to point it at line work, logos and clipart,
which is what it is genuinely good at.

## ⚠️ For whoever writes the site's Content-Security-Policy

This tool needs three things, and **the first fails silently** — nothing in the console, the tool
simply never produces output:

```
script-src   'wasm-unsafe-eval'   to compile WebAssembly at all
worker-src   'self'               for the tracing worker
connect-src  'self'               to fetch the local .wasm
```

`'wasm-unsafe-eval'` is far narrower than `'unsafe-eval'`: it permits WebAssembly compilation and
nothing else. No CSP ships on the site today so this works as it stands, but the site is built around
one, and the day it lands without these this tool stops working with no error to find.

The worker is a **real file rather than a Blob URL** for exactly this reason: a Blob worker would need
`worker-src blob:`, where a same-origin file needs only `'self'`, which the policy will have anyway.

## How the tracer is vendored

Upstream publishes a `wasm-pack --target nodejs` build. The binary is portable; only the loader is
not — the last five lines read the file off disk with `fs`.

`scripts/vendor.mjs` rewrites exactly that block into an async `init(url)` and converts the two
CommonJS exports to ESM. It is a script rather than a hand-edit of a 436-line generated file because
it can be re-run against a new upstream version, and because **it asserts on what it is replacing**:
if upstream changes the loader, vendoring fails loudly instead of silently producing a module that
looks fine and never instantiates. It also fails if any `require()` survives.

Re-run with `npm run vendor`. Provenance is recorded in `vendor/UPSTREAM.txt`.

## Four files, and only one is loaded up front

| File | Size | When |
|---|---|---|
| `raster-to-svg.js` | 11 KB | With the page |
| `raster-to-svg.css` | 3 KB | With the page |
| `raster-to-svg.worker.js` | 14 KB | First trace |
| `vtracer_wasm_bg.wasm` | 653 KB | First trace |

A visitor who never traces anything pays 14 KB. The tracer is not bundled into the page script for
that reason.

## Integration

Plain IIFE, does nothing unless the page contains `data-rv`.

| Attribute | Required | What it is |
|---|---|---|
| `data-rv` | yes | The root. Absent, the script does nothing. |
| `data-rv-worker` | yes on the site | URL of the worker. **Pass the content-hashed one** — a path baked into the bundle could not be cache-busted. |
| `data-rv-wasm` | yes on the site | URL of the binary, same reasoning. |
| `data-rv-intake` | yes | Drop target, containing an `<input type="file">` which is found, not created. |
| `data-rv-results` | yes | Where the traced SVG and its statistics go. |
| `data-rv-presets` / `data-rv-preset-note` | no | Preset buttons and the explanation under them. |
| `data-rv-busy` / `data-rv-error` | no | Progress and refusals. Give both `role="status"`. |
| `data-rv-download` | no | Anchor, given an `href` and `download` when a trace succeeds. |

The stylesheet defines only `.rv-` classes, enforced by a smoke check.

## Testing

```bash
npm run lint    # tsc --noEmit
npm test        # 19 tests
npm run smoke   # 26 checks against the built bundles
npm run demo    # serves demo/ on :4177
```

The smoke tier covers the worker as well as the page script, and asserts that **the worker fetches
exactly once** — the local binary and nothing else.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core) for file intake
and mounting, and [vtracer](https://github.com/visioncortex/vtracer) (MIT OR Apache-2.0) for the
tracing itself.

## Licence

MIT.
