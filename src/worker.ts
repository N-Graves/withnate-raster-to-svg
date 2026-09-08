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

      await init(wasmUrl);
      const svg = vectorize_bytes(bytes, options);
      post({ id, ok: true, svg, ms: Date.now() - started });
    } catch (err) {

      post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
});
