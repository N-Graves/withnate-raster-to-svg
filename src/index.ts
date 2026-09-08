/**
 * Raster to SVG - entry point.
 *
 * Runs entirely in the browser: the image is read, traced in WebAssembly in a
 * worker, and handed back. Nothing is uploaded and nothing is stored.
 *
 * ⚠️ FOR WHOEVER WRITES THE SITE'S CONTENT-SECURITY-POLICY. This tool needs
 * three things, and the first one fails SILENTLY - nothing in the console, the
 * tool simply never produces output:
 *
 *   script-src   'wasm-unsafe-eval'   to compile WebAssembly at all
 *   worker-src   'self'               for the worker (falls back to script-src)
 *   connect-src  'self'               to fetch the .wasm binary
 *
 * `'wasm-unsafe-eval'` is much narrower than `'unsafe-eval'`: it permits
 * WebAssembly compilation and nothing else. No CSP ships on the site today, so
 * this works as it stands - but the site is built around one, and the day it
 * lands without these this tool stops working with no error to find.
 */

import { attachIntake, mount } from "@nasdigitaluk/withnate-tool-core";
import {
  PRESETS,
  analyseSvg,
  formatBytes,
  noticesFor,
  optionsFor,
  type PresetId,
} from "./trace.js";
import type { TraceRequest, TraceResponse } from "./worker.js";

/** Above this, tracing takes long enough that people assume it has hung. */
const SLOW_SOURCE_BYTES = 2_000_000;

const h = (tag: string, attrs: Record<string, string | boolean> = {}, ...kids: Array<Node | string | null>): HTMLElement => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    if (k === "class") n.className = String(v);
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null) n.append(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
};

mount("[data-rv]", ({ root }) => {
  const intake = root.querySelector<HTMLElement>("[data-rv-intake]");
  const results = root.querySelector<HTMLElement>("[data-rv-results]");
  const errorOut = root.querySelector<HTMLElement>("[data-rv-error]");
  const busy = root.querySelector<HTMLElement>("[data-rv-busy]");
  const presetHost = root.querySelector<HTMLElement>("[data-rv-presets]");
  const download = root.querySelector<HTMLAnchorElement>("[data-rv-download]");
  if (!intake || !results) return;

  // Supplied by the page so the site can hand over content-hashed URLs. A path
  // hard-coded here would be cached for an hour with no way to bust it, which
  // is exactly the trap the site's own asset helper exists to avoid.
  const workerUrl = root.dataset["rvWorker"] ?? "./raster-to-svg.worker.js";
  const wasmUrl = root.dataset["rvWasm"] ?? "./vtracer_wasm_bg.wasm";

  let worker: Worker | null = null;
  let requestId = 0;
  let objectUrl: string | null = null;
  let lastFile: { bytes: Uint8Array; name: string } | null = null;
  let preset: PresetId = "artwork";

  const setBusy = (on: boolean, message = "Tracing…"): void => {
    if (!busy) return;
    busy.hidden = !on;
    busy.textContent = message;
  };
  const showError = (m: string): void => {
    if (errorOut) errorOut.textContent = m;
    results.replaceChildren();
    if (download) download.hidden = true;
    setBusy(false);
  };

  const ensureWorker = (): Worker | null => {
    if (worker) return worker;
    try {
      worker = new Worker(workerUrl);
    } catch {
      showError("This browser would not start the tracing worker, so tracing is unavailable here.");
      return null;
    }
    worker.addEventListener("message", (e: MessageEvent<TraceResponse>) => {
      const data = e.data;
      setBusy(false);
      if (!data.ok) {
        showError(`That image could not be traced. ${data.error}`);
        return;
      }
      show(data.svg, data.ms);
    });
    worker.addEventListener("error", () => {
      showError("The tracing worker stopped unexpectedly. Reload the page and try again.");
    });
    return worker;
  };

  const show = (svg: string, ms: number): void => {
    if (errorOut) errorOut.textContent = "";
    const analysis = analyseSvg(svg);
    const notices = noticesFor(analysis, lastFile?.bytes.length ?? 0);

    const preview = h("div", { class: "rv-preview" });
    // Inserted as markup rather than as an <img src="blob:">, so what is on
    // screen is the actual path data and not a picture of it.
    preview.innerHTML = svg;
    const el = preview.querySelector("svg");
    if (el) {
      el.removeAttribute("width");
      el.removeAttribute("height");
      el.setAttribute("class", "rv-svg");
    }

    results.replaceChildren(
      h(
        "div",
        { class: "rv-stats" },
        h("span", {}, `${analysis.pathCount.toLocaleString()} paths`),
        h("span", {}, formatBytes(analysis.bytes)),
        h("span", {}, `${(ms / 1000).toFixed(1)}s`),
        h("span", { class: analysis.containsRaster ? "rv-bad" : "rv-good" },
          analysis.containsRaster ? "contains a bitmap" : "real paths, no bitmap"),
      ),
      ...notices.map((n) => h("p", { class: "rv-notice" }, n)),
      preview,
    );

    if (download) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      download.href = objectUrl;
      download.download = (lastFile?.name ?? "traced").replace(/\.[^.]+$/, "") + ".svg";
      download.hidden = false;
    }
  };

  const trace = (): void => {
    if (!lastFile) return;
    const w = ensureWorker();
    if (!w) return;
    if (errorOut) errorOut.textContent = "";
    setBusy(
      true,
      lastFile.bytes.length > SLOW_SOURCE_BYTES
        ? "Tracing… a large or detailed image can take a while."
        : "Tracing…",
    );
    requestId += 1;
    const message: TraceRequest = {
      id: requestId,
      // A copy, because the buffer is transferred and the original would be
      // detached - which would break re-tracing with the other preset.
      bytes: lastFile.bytes.slice(),
      options: optionsFor(preset) as unknown as Record<string, unknown>,
      wasmUrl,
    };
    w.postMessage(message, [message.bytes.buffer]);
  };

  attachIntake(intake, {
    onReject: showError,
    onFile: (file) => {
      void file.arrayBuffer().then((buf) => {
        lastFile = { bytes: new Uint8Array(buf), name: file.name };
        if (presetHost) presetHost.hidden = false;
        trace();
      });
    },
  });

  if (presetHost) {
    presetHost.replaceChildren(
      ...PRESETS.map((p) => {
        const b = h("button", {
          type: "button",
          class: "sw",
          "aria-pressed": String(p.id === preset),
          title: p.note,
        }, p.label);
        b.addEventListener("click", () => {
          preset = p.id;
          for (const other of Array.from(presetHost.querySelectorAll("button"))) {
            other.setAttribute("aria-pressed", String(other.textContent === p.label));
          }
          const note = root.querySelector<HTMLElement>("[data-rv-preset-note]");
          if (note) note.textContent = p.note;
          trace();
        });
        return b;
      }),
    );
    const note = root.querySelector<HTMLElement>("[data-rv-preset-note]");
    if (note) note.textContent = PRESETS[0]!.note;
  }
});
