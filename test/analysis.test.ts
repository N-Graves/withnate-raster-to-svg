import { describe, expect, it } from "vitest";
import { analyseSvg, noticesFor } from "../src/trace.js";

const wrap = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;

describe("active content in the traced SVG", () => {

  it("is clear on what the tracer actually produces", () => {
    const svg = wrap('<path d="M0 0 L10 10 Z" fill="rgb(12,34,56)"/>');
    const a = analyseSvg(svg);
    expect(a.containsActiveContent).toBe(false);
    expect(a.pathCount).toBe(1);
    expect(noticesFor(a, 1000)).toEqual([]);
  });

  it("catches a script element", () => {
    expect(analyseSvg(wrap("<script>alert(1)</script>")).containsActiveContent).toBe(true);
  });

  it("catches an inline event handler, however it is spaced", () => {
    expect(analyseSvg(wrap('<path onload="x()"/>')).containsActiveContent).toBe(true);
    expect(analyseSvg(wrap('<path onclick = "x()"/>')).containsActiveContent).toBe(true);
  });

  it("catches a javascript: target", () => {
    expect(analyseSvg(wrap('<a href="javascript:x()"><path/></a>')).containsActiveContent).toBe(true);
  });

  it("says so first, ahead of every other notice", () => {
    const notices = noticesFor(
      {
        bytes: 40_000_000,
        pathCount: 50_000,
        containsRaster: true,
        oversized: true,
        containsActiveContent: true,
      },
      1000,
    );
    expect(notices[0]).toContain("could run");
    expect(notices[0]).toContain("not been drawn on screen");
  });

  it("does not fire on an ordinary attribute that merely starts with on", () => {

    const svg = wrap('<path fill-opacity="0.5" d="M0 0"/>');
    expect(analyseSvg(svg).containsActiveContent).toBe(false);
  });
});

describe("measuring without copying", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(analyseSvg("<svg>é</svg>").bytes).toBe(new TextEncoder().encode("<svg>é</svg>").length);
    expect(analyseSvg("<svg>😀</svg>").bytes).toBe(new TextEncoder().encode("<svg>😀</svg>").length);
  });

  it("agrees with TextEncoder on a large realistic body", () => {
    const svg = wrap('<path d="M0 0 L10 10 Z" fill="rgb(1,2,3)"/>'.repeat(5000));
    expect(analyseSvg(svg).bytes).toBe(new TextEncoder().encode(svg).length);
    expect(analyseSvg(svg).pathCount).toBe(5000);
  });
});
