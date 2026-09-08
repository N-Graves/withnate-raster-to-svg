# withnate-raster-to-svg

Turn a PNG or JPEG into a real vector SVG — actual path nodes, ready for Cricut, Silhouette or any
cutting machine.

**Runs entirely in the browser. Your file never leaves your device.**

MIT licensed. Status: **not built yet** — see the roadmap below.

## Real paths, not a raster in a wrapper

The trap in this category is that plenty of "converters" hand back an SVG with the original bitmap
embedded inside it. It opens, it looks right, and it is completely useless for cutting, because there
is no outline for the blade to follow. **Every path here is traced geometry.**

That is also the sharper audience. "PNG to SVG" is a crowded head term fought over by Adobe and a
dozen clones. "A cut file my Cricut will actually take" is a specific problem for people who make
things, and it is the same audience that buys clipart packs.

## Settings that were chosen by measurement

The tracing parameters come from a real SSIM bake-off run on this project's own artwork, against the
alternatives:

| Parameter | Value | Why |
|---|---|---|
| `color_precision` | 8 | With `layer_difference` 4, roughly doubled fidelity over the library defaults — SSIM 0.907 → 0.948 on gradient-heavy art, 0.663 → 0.860 on detail-dense art |
| `layer_difference` | 4 | As above. Below about 2 the layer count explodes for no visible gain |
| `filter_speckle` | 4 | Drops single-pixel noise that would otherwise become hundreds of tiny unusable paths |
| `corner_threshold` | 40 | |
| `path_precision` | 8 | |

## Two hard limits, stated up front

⚠️ **Flat fills only. There is no gradient support at all** — confirmed by tracing a pure gradient at
maximum precision and getting flat bands back. Photographic gradients will always band. This is a
property of the tracer, not a setting to turn up.

⚠️ **Detail-dense sources produce very large files.** A real photograph hit 76MB even at tuned
settings. There is a warning at 15MB, because a 76MB SVG will hang whatever you open it in.

Neither of these is a reason not to use it. They are reasons to point it at flat artwork, line work
and logos, which is what it is genuinely good at.

## Note for whoever writes the site's Content-Security-Policy

This tool needs `'wasm-unsafe-eval'` in `script-src`, and it will fail **silently** without it —
nothing in the console, the tool simply never produces output. That is narrower than `'unsafe-eval'`
and grants only WebAssembly compilation. Same-origin Web Workers are fine under `script-src 'self'`
and need no extra directive.

The `.wasm` binary is vendored, not fetched from a CDN, because the site refuses third-party requests
of any kind.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core).

## Licence

MIT.
