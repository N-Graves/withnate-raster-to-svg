/*! withnate-raster-to-svg v0.1.0 - MIT
 * https://github.com/N-Graves/withnate-raster-to-svg#readme
 * Runs entirely in the browser. No network requests except the local .wasm.
 */
"use strict";
(() => {
  // node_modules/@nasdigitaluk/withnate-tool-core/dist/bytes.js
  var u8 = (b, i) => {
    const v = b[i];
    if (v === void 0)
      throw new RangeError(`byte ${i} is past the end of the buffer`);
    return v;
  };
  var be16 = (b, i) => u8(b, i) << 8 | u8(b, i + 1);
  var le16 = (b, i) => u8(b, i) | u8(b, i + 1) << 8;
  var le24 = (b, i) => u8(b, i) | u8(b, i + 1) << 8 | u8(b, i + 2) << 16;
  var be32 = (b, i) => (u8(b, i) << 24 | u8(b, i + 1) << 16 | u8(b, i + 2) << 8 | u8(b, i + 3)) >>> 0;
  var le32 = (b, i) => (u8(b, i) | u8(b, i + 1) << 8 | u8(b, i + 2) << 16 | u8(b, i + 3) << 24) >>> 0;
  var matchBytes = (b, sig, offset = 0) => {
    if (b.length < offset + sig.length)
      return false;
    for (let i = 0; i < sig.length; i += 1) {
      if (b[offset + i] !== sig[i])
        return false;
    }
    return true;
  };
  var matchAscii = (b, offset, s) => {
    if (b.length < offset + s.length)
      return false;
    for (let i = 0; i < s.length; i += 1) {
      if (b[offset + i] !== s.charCodeAt(i))
        return false;
    }
    return true;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  var JPEG_SIG = [255, 216, 255];
  var GIF87_SIG = [71, 73, 70, 56, 55, 97];
  var GIF89_SIG = [71, 73, 70, 56, 57, 97];
  var RIFF_SIG = [82, 73, 70, 70];
  var WEBP_SIG = [87, 69, 66, 80];
  var HEADER_BYTES = 64 * 1024;
  var sniffFormat = (bytes) => {
    if (matchBytes(bytes, PNG_SIG))
      return "png";
    if (matchBytes(bytes, JPEG_SIG))
      return "jpeg";
    if (matchBytes(bytes, GIF87_SIG) || matchBytes(bytes, GIF89_SIG))
      return "gif";
    if (matchBytes(bytes, RIFF_SIG) && matchBytes(bytes, WEBP_SIG, 8))
      return "webp";
    return null;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/units.js
  var MM_PER_INCH = 25.4;
  var CM_PER_INCH = MM_PER_INCH / 10;
  var MM_PER_METRE = 1e3;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/exif.js
  var TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  var MAX_ENTRIES = 4096;
  var MAX_COMPONENTS = 1024;
  var MAX_BLOCK_BYTES = 4 * 1024 * 1024;
  var key = (ifd, tag) => `${ifd}:${tag}`;
  var findTiffBlock = (bytes) => {
    const format = sniffFormat(bytes);
    if (format === "jpeg") {
      let p = 2;
      while (p + 4 <= bytes.length) {
        if (u8(bytes, p) !== 255) {
          p += 1;
          continue;
        }
        const marker = u8(bytes, p + 1);
        if (marker === 216 || marker >= 208 && marker <= 217 || marker === 1) {
          p += 2;
          continue;
        }
        const len = u8(bytes, p + 2) << 8 | u8(bytes, p + 3);
        if (len < 2)
          return null;
        if (marker === 225 && matchAscii(bytes, p + 4, "Exif\0\0")) {
          return bytes.subarray(p + 10, p + 2 + len);
        }
        if (marker === 218)
          return null;
        p = p + 2 + len;
      }
      return null;
    }
    if (format === "png") {
      let p = 8;
      while (p + 8 <= bytes.length) {
        const len = be32(bytes, p);
        if (matchAscii(bytes, p + 4, "eXIf"))
          return bytes.subarray(p + 8, p + 8 + len);
        if (matchAscii(bytes, p + 4, "IDAT") || matchAscii(bytes, p + 4, "IEND"))
          return null;
        p += 12 + len;
      }
      return null;
    }
    if (format === "webp") {
      let p = 12;
      while (p + 8 <= bytes.length) {
        const len = le32(bytes, p + 4);
        if (matchAscii(bytes, p, "EXIF")) {
          const start = matchAscii(bytes, p + 8, "Exif\0\0") ? p + 14 : p + 8;
          return bytes.subarray(start, p + 8 + len);
        }
        p += 8 + len + len % 2;
      }
      return null;
    }
    return null;
  };
  var reader = (b, little) => ({
    u16: (i) => little ? u8(b, i) | u8(b, i + 1) << 8 : u8(b, i) << 8 | u8(b, i + 1),
    u32: (i) => little ? le32(b, i) : be32(b, i),
    i32: (i) => (little ? le32(b, i) : be32(b, i)) | 0,
    byte: (i) => u8(b, i)
  });
  var TEXT = new TextDecoder("utf-8", { fatal: false });
  var decodeAscii = (block, offset, count) => {
    let end = offset;
    const limit = offset + count;
    while (end < limit && block[end] !== 0)
      end += 1;
    return TEXT.decode(block.subarray(offset, end)).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  };
  var readValue = (r, block, type, count, offset) => {
    if (type === 2)
      return decodeAscii(block, offset, count);
    const size = TYPE_SIZE[type];
    const one = (i) => {
      const at = offset + i * size;
      switch (type) {
        case 1:
        case 7:
          return r.byte(at);
        case 3:
          return r.u16(at);
        case 4:
          return r.u32(at);
        case 9:
          return r.i32(at);
        case 5:
          return { numerator: r.u32(at), denominator: r.u32(at + 4) };
        case 10:
          return { numerator: r.i32(at), denominator: r.i32(at + 4) };
        default:
          return 0;
      }
    };
    if (count === 1)
      return one(0);
    const out = [];
    for (let i = 0; i < count; i += 1)
      out.push(one(i));
    return out;
  };
  var IFD_EXIF_POINTER = 34665;
  var IFD_GPS_POINTER = 34853;
  var readIfd = (r, block, start, ifd, entries, seen, depth) => {
    if (depth > 4 || seen.has(start) || start + 2 > block.length)
      return 0;
    seen.add(start);
    const count = r.u16(start);
    let p = start + 2;
    for (let i = 0; i < count; i += 1, p += 12) {
      if (p + 12 > block.length || entries.length >= MAX_ENTRIES)
        break;
      const tag = r.u16(p);
      const type = r.u16(p + 2);
      const n = r.u32(p + 4);
      const size = TYPE_SIZE[type] ?? 0;
      if (size === 0 || n === 0)
        continue;
      const bytesNeeded = size * n;
      const valueAt = bytesNeeded <= 4 ? p + 8 : r.u32(p + 8);
      if (valueAt + bytesNeeded > block.length)
        continue;
      if (tag === IFD_EXIF_POINTER || tag === IFD_GPS_POINTER) {
        const target = bytesNeeded <= 4 ? r.u32(p + 8) : valueAt;
        readIfd(r, block, target, tag === IFD_EXIF_POINTER ? "exif" : "gps", entries, seen, depth + 1);
        continue;
      }
      if (type !== 2 && n > MAX_COMPONENTS)
        continue;
      try {
        entries.push({ tag, ifd, type, count: n, value: readValue(r, block, type, n, valueAt) });
      } catch {
        continue;
      }
    }
    return p + 4 <= block.length ? r.u32(p) : 0;
  };
  var parseExif = (bytes) => {
    try {
      const block = findTiffBlock(bytes);
      if (!block || block.length < 8 || block.length > MAX_BLOCK_BYTES)
        return null;
      const order = block[0] === 73 && block[1] === 73 ? "little" : block[0] === 77 && block[1] === 77 ? "big" : null;
      if (!order)
        return null;
      const r = reader(block, order === "little");
      if (r.u16(2) !== 42)
        return null;
      const entries = [];
      const seen = /* @__PURE__ */ new Set();
      const next = readIfd(r, block, r.u32(4), "image", entries, seen, 0);
      if (next > 0)
        readIfd(r, block, next, "thumbnail", entries, seen, 1);
      const byKey = /* @__PURE__ */ new Map();
      for (const e of entries)
        byKey.set(key(e.ifd, e.tag), e);
      return { byteOrder: order, entries, byKey };
    } catch {
      return null;
    }
  };
  var ratioValue = (v) => {
    if (typeof v === "number")
      return v;
    if (typeof v === "object" && v !== null && "numerator" in v) {
      return v.denominator === 0 ? null : v.numerator / v.denominator;
    }
    return null;
  };
  var exifNumber = (data, ifd, tag) => {
    const e = data.byKey.get(key(ifd, tag));
    return e ? ratioValue(e.value) : null;
  };
  var TAG_X_RESOLUTION = 282;
  var TAG_Y_RESOLUTION = 283;
  var TAG_RESOLUTION_UNIT = 296;
  var exifResolution = (data) => {
    const x = exifNumber(data, "image", TAG_X_RESOLUTION);
    const y = exifNumber(data, "image", TAG_Y_RESOLUTION);
    if (x === null || y === null || x <= 0 || y <= 0)
      return null;
    const unit = exifNumber(data, "image", TAG_RESOLUTION_UNIT) ?? 2;
    if (unit === 2)
      return { x, y };
    if (unit === 3)
      return { x: x * CM_PER_INCH, y: y * CM_PER_INCH };
    return null;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/dimensions.js
  var measurePng = (b) => {
    const width = be32(b, 16);
    const height = be32(b, 20);
    let density = null;
    let p = 8;
    while (p + 8 <= b.length) {
      const len = be32(b, p);
      const type = p + 4;
      if (matchAscii(b, type, "IDAT") || matchAscii(b, type, "IEND"))
        break;
      if (matchAscii(b, type, "pHYs") && len === 9 && p + 8 + 9 <= b.length) {
        const d = p + 8;
        const perMetreX = be32(b, d);
        const perMetreY = be32(b, d + 4);
        if (u8(b, d + 8) === 1 && perMetreX > 0 && perMetreY > 0) {
          density = {
            x: perMetreX * MM_PER_INCH / MM_PER_METRE,
            y: perMetreY * MM_PER_INCH / MM_PER_METRE,
            source: "png-phys"
          };
        }
        break;
      }
      p += 12 + len;
    }
    return { format: "png", width, height, density };
  };
  var isSof = (m) => m >= 192 && m <= 195 || m >= 197 && m <= 199 || m >= 201 && m <= 203 || m >= 205 && m <= 207;
  var measureJpeg = (b) => {
    let density = null;
    let p = 2;
    while (p + 4 <= b.length) {
      if (u8(b, p) !== 255) {
        p += 1;
        continue;
      }
      const marker = u8(b, p + 1);
      if (marker === 255) {
        p += 1;
        continue;
      }
      if (marker === 216 || marker >= 208 && marker <= 217 || marker === 1) {
        p += 2;
        continue;
      }
      const len = be16(b, p + 2);
      if (len < 2)
        break;
      const payload = p + 4;
      if (isSof(marker)) {
        return { format: "jpeg", height: be16(b, payload + 1), width: be16(b, payload + 3), density };
      }
      if (marker === 224 && matchAscii(b, payload, "JFIF\0")) {
        const units = u8(b, payload + 7);
        const x = be16(b, payload + 8);
        const y = be16(b, payload + 10);
        if (x > 0 && y > 0) {
          if (units === 1)
            density = { x, y, source: "jfif" };
          else if (units === 2) {
            density = { x: x * CM_PER_INCH, y: y * CM_PER_INCH, source: "jfif" };
          }
        }
      }
      if (marker === 218)
        break;
      p = payload + len - 2;
    }
    throw new RangeError("no start-of-frame segment found");
  };
  var measureGif = (b) => ({
    format: "gif",
    width: le16(b, 6),
    height: le16(b, 8),
    density: null
  });
  var measureWebp = (b) => {
    const fourcc = String.fromCharCode(u8(b, 12), u8(b, 13), u8(b, 14), u8(b, 15));
    const data = 20;
    if (fourcc === "VP8X") {
      return {
        format: "webp",
        width: le24(b, data + 4) + 1,
        height: le24(b, data + 7) + 1,
        density: null
      };
    }
    if (fourcc === "VP8 ") {
      return {
        format: "webp",
        width: le16(b, data + 6) & 16383,
        height: le16(b, data + 8) & 16383,
        density: null
      };
    }
    if (fourcc === "VP8L") {
      if (u8(b, data) !== 47)
        throw new RangeError("VP8L signature byte missing");
      const bits = u8(b, data + 1) | u8(b, data + 2) << 8 | u8(b, data + 3) << 16 | u8(b, data + 4) << 24;
      return {
        format: "webp",
        width: (bits & 16383) + 1,
        height: (bits >>> 14 & 16383) + 1,
        density: null
      };
    }
    throw new RangeError(`unrecognised WebP chunk "${fourcc}"`);
  };
  var MEASURERS = {
    png: measurePng,
    jpeg: measureJpeg,
    gif: measureGif,
    webp: measureWebp
  };
  var measureImage = (bytes) => {
    const format = sniffFormat(bytes);
    if (format === null)
      return null;
    try {
      const m = MEASURERS[format](bytes);
      if (!Number.isFinite(m.width) || !Number.isFinite(m.height) || m.width < 1 || m.height < 1) {
        return null;
      }
      if (m.density === null) {
        const exif = parseExif(bytes);
        const res = exif ? exifResolution(exif) : null;
        if (res)
          m.density = { x: res.x, y: res.y, source: "exif" };
      }
      return m;
    } catch {
      return null;
    }
  };

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
  var readHeaderBytes = async (file, n = HEADER_BYTES) => {
    const buf = await file.slice(0, n).arrayBuffer();
    return new Uint8Array(buf);
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => globalThis.WN ?? null;
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
  var utf8Length = (s) => {
    let n = 0;
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      if (c < 128) n += 1;
      else if (c < 2048) n += 2;
      else if (c >= 55296 && c <= 56319) {
        n += 4;
        i += 1;
      } else n += 3;
    }
    return n;
  };
  var countMatches = (s, source) => {
    const re = new RegExp(source, "g");
    let n = 0;
    while (re.exec(s) !== null) n += 1;
    return n;
  };
  var ACTIVE_CONTENT = /<script\b|\son\w+\s*=|javascript:/i;
  var analyseSvg = (svg) => {
    const bytes = utf8Length(svg);
    return {
      bytes,
      pathCount: countMatches(svg, "<path\\b"),
      containsRaster: /<image\b/i.test(svg) || /data:image\//i.test(svg),
      oversized: bytes >= SIZE_WARNING_BYTES,
      containsActiveContent: ACTIVE_CONTENT.test(svg)
    };
  };
  var round = (n, dp = 1) => {
    const f = 10 ** dp;
    return Math.round(n * f) / f;
  };
  var formatBytes = (n) => n >= 1e6 ? `${round(n / 1e6)} MB` : `${Math.round(n / 1e3)} KB`;
  var noticesFor = (analysis, sourceBytes) => {
    const out = [];
    if (analysis.containsActiveContent) {
      out.push(
        "This SVG carries something that could run, which the tracer should never produce \u2014 it has not been drawn on screen, and it should be reported rather than opened."
      );
    }
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
  var MAX_SOURCE_PIXELS = 24e6;
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
        bytes: lastFile.bytes.slice(),
        options: optionsFor(preset),
        wasmUrl
      };
      w.postMessage(message, [message.bytes.buffer]);
    };
    attachIntake(intake, {
      onReject: showError,
      onFile: (file) => {
        void (async () => {
          const header = measureImage(await readHeaderBytes(file));
          if (header && header.width * header.height > MAX_SOURCE_PIXELS) {
            const mp = Math.round(header.width * header.height / 1e5) / 10;
            showError(
              `That image is ${mp} megapixels. Tracing it would take minutes and produce an SVG too large to open, let alone cut. Flat artwork at a more ordinary size is what this is for.`
            );
            return;
          }
          const buf = await file.arrayBuffer();
          lastFile = { bytes: new Uint8Array(buf), name: file.name };
          if (presetHost) presetHost.hidden = false;
          trace();
        })().catch(() => showError("That file could not be read."));
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
