import {
  attachIntake,
  h,
  measureImage,
  mount,
  readHeaderBytes,
} from "@nasdigitaluk/withnate-tool-core";
import {
  PRESETS,
  analyseSvg,
  formatBytes,
  noticesFor,
  optionsFor,
  type PresetId,
} from "./trace.js";
import type { TraceRequest, TraceResponse } from "./worker.js";

const SLOW_SOURCE_BYTES = 2_000_000;

const MAX_SOURCE_PIXELS = 24e6;

mount("[data-rv]", ({ root }) => {
  const intake = root.querySelector<HTMLElement>("[data-rv-intake]");
  const results = root.querySelector<HTMLElement>("[data-rv-results]");
  const errorOut = root.querySelector<HTMLElement>("[data-rv-error]");
  const busy = root.querySelector<HTMLElement>("[data-rv-busy]");
  const presetHost = root.querySelector<HTMLElement>("[data-rv-presets]");
  const download = root.querySelector<HTMLAnchorElement>("[data-rv-download]");
  if (!intake || !results) return;

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

    if (!analysis.containsActiveContent) {
      preview.innerHTML = svg;
      const el = preview.querySelector("svg");
      if (el) {
        el.removeAttribute("width");
        el.removeAttribute("height");
        el.setAttribute("class", "rv-svg");
      }
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

      bytes: lastFile.bytes.slice(),
      options: optionsFor(preset) as unknown as Record<string, unknown>,
      wasmUrl,
    };
    w.postMessage(message, [message.bytes.buffer]);
  };

  attachIntake(intake, {
    onReject: showError,
    onFile: (file) => {
      void (async () => {

        const header = measureImage(await readHeaderBytes(file));
        if (header && header.width * header.height > MAX_SOURCE_PIXELS) {
          const mp = Math.round((header.width * header.height) / 1e5) / 10;
          showError(
            `That image is ${mp} megapixels. Tracing it would take minutes and produce an SVG too large to open, let alone cut. Flat artwork at a more ordinary size is what this is for.`,
          );
          return;
        }
        const buf = await file.arrayBuffer();
        lastFile = { bytes: new Uint8Array(buf), name: file.name };
        if (presetHost) presetHost.hidden = false;
        trace();
      })().catch(() => showError("That file could not be read."));
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
