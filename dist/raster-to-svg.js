/*! withnate-raster-to-svg v0.1.0 - MIT
 * https://github.com/N-Graves/withnate-raster-to-svg#readme
 * Runs entirely in the browser. No network requests except the local .wasm.
 */
"use strict";
(() => {
  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var HEADER_BYTES = 64 * 1024;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/intake.js
  var DEFAULT_DRAGGING_CLASS = "is-dragging";
  var humanBytes = (n) => n >= 1024 * 1024 ? `${Math.round(n / (1024 * 1024))}MB` : `${Math.round(n / 1024)}KB`;
  var attachIntake = (root, opts) => {
    const draggingClass = opts.draggingClass ?? DEFAULT_DRAGGING_CLASS;
    const input = root.querySelector('input[type="file"]');
    const accept = (file) => {
      if (!file)
        return;
      if (opts.maxBytes && file.size > opts.maxBytes) {
        opts.onReject?.(`That file is ${humanBytes(file.size)}. The limit here is ${humanBytes(opts.maxBytes)}.`);
        return;
      }
      if (file.size === 0) {
        opts.onReject?.("That file is empty.");
        return;
      }
      opts.onFile(file);
    };
    const onDragEnter = (e) => {
      e.preventDefault();
      root.classList.add(draggingClass);
    };
    const onDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer)
        e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e) => {
      if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget))
        return;
      root.classList.remove(draggingClass);
    };
    const onDrop = (e) => {
      e.preventDefault();
      root.classList.remove(draggingClass);
      accept(e.dataTransfer?.files?.[0]);
    };
    const onChange = () => {
      accept(input?.files?.[0]);
      if (input)
        input.value = "";
    };
    const onPaste = (e) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file");
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        accept(file);
      }
    };
    root.addEventListener("dragenter", onDragEnter);
    root.addEventListener("dragover", onDragOver);
    root.addEventListener("dragleave", onDragLeave);
    root.addEventListener("drop", onDrop);
    input?.addEventListener("change", onChange);
    document.addEventListener("paste", onPaste);
    return () => {
      root.removeEventListener("dragenter", onDragEnter);
      root.removeEventListener("dragover", onDragOver);
      root.removeEventListener("dragleave", onDragLeave);
      root.removeEventListener("drop", onDrop);
      input?.removeEventListener("change", onChange);
      document.removeEventListener("paste", onPaste);
      root.classList.remove(draggingClass);
    };
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => {
    const w = globalThis;
    return w.WN ?? null;
  };
  var mount = (selector, init) => {
    const run = () => {
      const root = document.querySelector(selector);
      if (!root)
        return;
      const wn = getWn();
      const reduced = wn?.reduced ?? (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : true);
      init({ root, wn, reduced });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  };

  // src/trace.ts
  var ARTWORK = Object.freeze({
    clustering: "color-cluster",
    mode: "spline",
    filterSpeckle: 4,
    colorPrecision: 8,
    layerDifference: 4,
    cornerThreshold: 40,
    lengthThreshold: 2,
    maxIterations: 15,
    spliceThreshold: 30,
    pathPrecision: 8
  });
  var CUTTING = Object.freeze({
    clustering: "bw",
    mode: "spline",
    filterSpeckle: 8,
    cornerThreshold: 40,
    lengthThreshold: 2,
    maxIterations: 15,
    spliceThreshold: 30,
    pathPrecision: 6
  });
  var PRESETS = [
    {
      id: "artwork",
      label: "Colour artwork",
      note: "Keeps the colours, as stacked layers. Best for illustration and clipart.",
      options: ARTWORK
    },
    {
      id: "cutting",
      label: "Cutting file",
      note: "One colour, clean closed outlines. What a Cricut or Silhouette actually needs.",
      options: CUTTING
    }
  ];
  var optionsFor = (id) => ({
    ...id === "cutting" ? CUTTING : ARTWORK
  });
  var SIZE_WARNING_BYTES = 15e6;
  var analyseSvg = (svg) => {
    const bytes = new TextEncoder().encode(svg).length;
    return {
      bytes,
      pathCount: (svg.match(/<path\b/g) ?? []).length,
      containsRaster: /<image\b/i.test(svg) || /data:image\//i.test(svg),
      oversized: bytes >= SIZE_WARNING_BYTES
    };
  };
  var round = (n, dp = 1) => {
    const f = 10 ** dp;
    return Math.round(n * f) / f;
  };
  var formatBytes = (n) => n >= 1e6 ? `${round(n / 1e6)} MB` : `${Math.round(n / 1e3)} KB`;
  var noticesFor = (analysis, sourceBytes) => {
    const out = [];
    if (analysis.containsRaster) {
      out.push(
        "This SVG has a bitmap embedded in it rather than real paths, which should not happen \u2014 please report it, because a file like that is no use for cutting."
      );
    }
    if (analysis.oversized) {
      out.push(
        `At ${formatBytes(analysis.bytes)} this is large enough to be slow, or to hang, in whatever you open it in. Detail-dense photographs do this. A simpler source, or the cutting preset, gives a far smaller file.`
      );
    }
    if (analysis.pathCount > 2e4) {
      out.push(
        `${analysis.pathCount.toLocaleString()} separate paths. A cutting machine will struggle with that \u2014 raise the speckle filter or start from flatter artwork.`
      );
    }
    if (analysis.bytes > sourceBytes * 8 && !analysis.oversized) {
      out.push(
        "The SVG is a good deal bigger than the image it came from, which is normal for photographic sources \u2014 vector is not a compression format."
      );
    }
    return out;
  };

  // src/index.ts
  var SLOW_SOURCE_BYTES = 2e6;
  var h = (tag, attrs = {}, ...kids) => {
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
    const intake = root.querySelector("[data-rv-intake]");
    const results = root.querySelector("[data-rv-results]");
    const errorOut = root.querySelector("[data-rv-error]");
    const busy = root.querySelector("[data-rv-busy]");
    const presetHost = root.querySelector("[data-rv-presets]");
    const download = root.querySelector("[data-rv-download]");
    if (!intake || !results) return;
    const workerUrl = root.dataset["rvWorker"] ?? "./raster-to-svg.worker.js";
    const wasmUrl = root.dataset["rvWasm"] ?? "./vtracer_wasm_bg.wasm";
    let worker = null;
    let requestId = 0;
    let objectUrl = null;
    let lastFile = null;
    let preset = "artwork";
    const setBusy = (on, message = "Tracing\u2026") => {
      if (!busy) return;
      busy.hidden = !on;
      busy.textContent = message;
    };
    const showError = (m) => {
      if (errorOut) errorOut.textContent = m;
      results.replaceChildren();
      if (download) download.hidden = true;
      setBusy(false);
    };
    const ensureWorker = () => {
      if (worker) return worker;
      try {
        worker = new Worker(workerUrl);
      } catch {
        showError("This browser would not start the tracing worker, so tracing is unavailable here.");
        return null;
      }
      worker.addEventListener("message", (e) => {
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
    const show = (svg, ms) => {
      if (errorOut) errorOut.textContent = "";
      const analysis = analyseSvg(svg);
      const notices = noticesFor(analysis, lastFile?.bytes.length ?? 0);
      const preview = h("div", { class: "rv-preview" });
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
          h("span", {}, `${(ms / 1e3).toFixed(1)}s`),
          h(
            "span",
            { class: analysis.containsRaster ? "rv-bad" : "rv-good" },
            analysis.containsRaster ? "contains a bitmap" : "real paths, no bitmap"
          )
        ),
        ...notices.map((n) => h("p", { class: "rv-notice" }, n)),
        preview
      );
      if (download) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        download.href = objectUrl;
        download.download = (lastFile?.name ?? "traced").replace(/\.[^.]+$/, "") + ".svg";
        download.hidden = false;
      }
    };
    const trace = () => {
      if (!lastFile) return;
      const w = ensureWorker();
      if (!w) return;
      if (errorOut) errorOut.textContent = "";
      setBusy(
        true,
        lastFile.bytes.length > SLOW_SOURCE_BYTES ? "Tracing\u2026 a large or detailed image can take a while." : "Tracing\u2026"
      );
      requestId += 1;
      const message = {
        id: requestId,
        // A copy, because the buffer is transferred and the original would be
        // detached - which would break re-tracing with the other preset.
        bytes: lastFile.bytes.slice(),
        options: optionsFor(preset),
        wasmUrl
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
      }
    });
    if (presetHost) {
      presetHost.replaceChildren(
        ...PRESETS.map((p) => {
          const b = h("button", {
            type: "button",
            class: "sw",
            "aria-pressed": String(p.id === preset),
            title: p.note
          }, p.label);
          b.addEventListener("click", () => {
            preset = p.id;
            for (const other of Array.from(presetHost.querySelectorAll("button"))) {
              other.setAttribute("aria-pressed", String(other.textContent === p.label));
            }
            const note2 = root.querySelector("[data-rv-preset-note]");
            if (note2) note2.textContent = p.note;
            trace();
          });
          return b;
        })
      );
      const note = root.querySelector("[data-rv-preset-note]");
      if (note) note.textContent = PRESETS[0].note;
    }
  });
})();
