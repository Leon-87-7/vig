import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoPreviewRing, ringGeometry } from "./no-preview-ring";

describe("NoPreviewRing", () => {
  it("geometry is deterministic per seed and stays in bounds", () => {
    const a = ringGeometry("job-1");
    expect(ringGeometry("job-1")).toEqual(a);
    expect(ringGeometry("job-2")).not.toEqual(a);
    expect(a.size).toBeGreaterThanOrEqual(112);
    expect(a.size).toBeLessThanOrEqual(176);
    // center hugs one edge: exactly one axis is edge-relative (px/calc)
    const edgy = [a.left, a.top].filter((v) => !/^\d+%$/.test(v));
    expect(edgy).toHaveLength(1);
  });

  it("stays in bounds across many seeds (incl. high-bit hashes)", () => {
    for (let i = 0; i < 500; i++) {
      const g = ringGeometry(`job-${i}`);
      expect(g.size).toBeGreaterThanOrEqual(112);
      expect(g.size).toBeLessThanOrEqual(176);
      expect(g.angle).toBeGreaterThanOrEqual(0);
      expect(g.angle).toBeLessThan(360);
      for (const v of [g.left, g.top]) {
        const pct = /^(\d+)%$/.exec(v);
        if (pct) {
          expect(Number(pct[1])).toBeGreaterThanOrEqual(25);
          expect(Number(pct[1])).toBeLessThanOrEqual(75);
        } else {
          // px / calc edge insets derive from size*t — never negative
          expect(v).toMatch(/^(calc\(100% - )?\d+px\)?$/);
        }
      }
    }
  });

  it("renders decorative ring text with the pipeline type", () => {
    const { container } = render(<NoPreviewRing seed="job-1" label="link" />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root?.textContent).toContain("◉ NO PREVIEW ◉ LINK");
  });
});
