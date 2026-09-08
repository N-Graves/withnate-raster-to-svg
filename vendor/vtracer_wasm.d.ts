/**
 * Types for the vendored vtracer glue.
 *
 * Hand-written rather than generated: upstream ships types for its Node build,
 * and the loader here is different because it was replaced by scripts/vendor.mjs.
 * Only the three things this project calls are declared.
 */

/** Fetch and instantiate the WebAssembly module. Safe to call more than once. */
export function init(wasmUrl: string): Promise<void>;

/** True once `init` has completed. */
export function isReady(): boolean;

/**
 * Vectorise encoded image bytes (PNG, JPEG, GIF or BMP) and return the SVG.
 * Throws if `init` has not been awaited first.
 */
export function vectorize_bytes(data: Uint8Array, options: Record<string, unknown>): string;

/** Vectorise a raw RGBA8 buffer of `width * height * 4` bytes. */
export function vectorize_rgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: Record<string, unknown>,
): string;
