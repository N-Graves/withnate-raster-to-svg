/**
 * The tracing worker.
 *
 * Tracing is seconds of solid CPU on anything larger than a thumbnail, and on
 * the main thread that is a frozen page - no scrolling, no cancelling, and on
 * a phone an unresponsive-tab warning. So it runs here instead, and the page
 * stays alive throughout.
 *
 * A real worker file rather than a Blob URL, deliberately. A Blob worker would
 * need `worker-src blob:` in the site's Content-Security-Policy, where a
 * same-origin file needs only `'self'` - which the policy will have anyway.
 */

import { init, vectorize_bytes } from "../vendor/vtracer_wasm.js";

export interface TraceRequest {
  id: number;
  bytes: Uint8Array;
  options: Record<string, unknown>;
  wasmUrl: string;
}

export type TraceResponse =
  | { id: number; ok: true; svg: string; ms: number }
  | { id: number; ok: false; error: string };

const post = (message: TraceResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

self.addEventListener("message", (event: MessageEvent<TraceRequest>) => {
  const { id, bytes, options, wasmUrl } = event.data;
  void (async () => {
    const started = Date.now();
    try {
      // Loaded on first use rather than at startup. The binary is over half a
      // megabyte and most visitors to a page carrying this script will never
      // trace anything.
      await init(wasmUrl);
      const svg = vectorize_bytes(bytes, options);
      post({ id, ok: true, svg, ms: Date.now() - started });
    } catch (err) {
      // Reported rather than thrown. An uncaught error in a worker surfaces as
      // silence on the page, which is indistinguishable from it still working.
      post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
});
