/**
 * Contract: strategy.matrix expansion (GitHub Actions semantics)
 *
 * Guards `expandMatrix` in `src/lib/pipeline.ts`.
 */
import { describe, expect, it } from "vitest";
import { expandMatrix } from "@/lib/pipeline";

describe("matrix expansion contract", () => {
  it("produces the cartesian product of dimensions", () => {
    const combos = expandMatrix({ os: ["ubuntu", "windows"], node: ["18", "20"] });
    expect(combos).toHaveLength(4);
    expect(combos).toEqual([
      { os: "ubuntu", node: "18" },
      { os: "ubuntu", node: "20" },
      { os: "windows", node: "18" },
      { os: "windows", node: "20" },
    ]);
  });

  it("handles a single dimension", () => {
    expect(expandMatrix({ node: ["18", "20", "22"] })).toHaveLength(3);
    expect(expandMatrix({ node: "18" })).toEqual([{ node: "18" }]);
  });

  it("returns a single empty combination when there are no dimensions", () => {
    expect(expandMatrix({})).toEqual([{}]);
  });

  it("removes excluded combinations", () => {
    const combos = expandMatrix({
      os: ["ubuntu", "windows"],
      node: ["18", "20"],
      exclude: [{ os: "windows", node: "18" }],
    });
    expect(combos).toHaveLength(3);
    expect(combos).not.toContainEqual({ os: "windows", node: "18" });
  });

  it("adds include entries and merges matching ones", () => {
    const combos = expandMatrix({
      os: ["ubuntu"],
      include: [
        { os: "ubuntu", node: "20", experimental: true },
        { os: "windows", node: "18" },
      ],
    });
    expect(combos).toHaveLength(3);
    expect(combos).toContainEqual({ os: "ubuntu", node: "20", experimental: true });
    expect(combos).toContainEqual({ os: "windows", node: "18" });
  });

  it("applies exclude after include", () => {
    const combos = expandMatrix({
      os: ["ubuntu", "windows"],
      node: ["18"],
      exclude: [{ os: "ubuntu" }],
      include: [{ os: "windows", node: "18" }],
    });
    // ubuntu combos removed; windows/18 survives (include re-adds)
    expect(combos).toEqual([{ os: "windows", node: "18" }]);
  });

  it("does not mutate the input matrix", () => {
    const matrix = { os: ["ubuntu"], node: ["18"] };
    const snapshot = JSON.stringify(matrix);
    expandMatrix(matrix);
    expect(JSON.stringify(matrix)).toBe(snapshot);
  });
});
