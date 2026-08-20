import { describe, expect, it } from "vitest";
import {
  displayPresetName,
  filterPresetNames,
  formatTime,
  getRandomIndex,
  getRendererDimensions,
  wrapIndex,
} from "./visualizer";

describe("visualizer helpers", () => {
  it("formats track times", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.9)).toBe("1:05");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });

  it("cleans preset names for display", () => {
    expect(displayPresetName("__Geiss   - Artifact 01")).toBe(
      "Geiss - Artifact 01",
    );
  });

  it("keeps every preset available when browsing without a query", () => {
    const names = Array.from({ length: 100 }, (_, index) => `Preset ${index + 1}`);

    expect(filterPresetNames(names, "")).toHaveLength(100);
    expect(filterPresetNames(names, "preset 100")).toEqual(["Preset 100"]);
  });

  it("sizes the renderer in physical pixels and caps supersampling", () => {
    expect(getRendererDimensions(1024, 768, 2)).toEqual({
      width: 2048,
      height: 1536,
      pixelRatio: 2,
    });
    expect(getRendererDimensions(1024, 768, 3)).toEqual({
      width: 2048,
      height: 1536,
      pixelRatio: 2,
    });
  });

  it("wraps preset indexes", () => {
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(5, 5)).toBe(0);
  });

  it("does not pick the current preset when alternatives exist", () => {
    expect(getRandomIndex(3, 1, 0)).toBe(0);
    expect(getRandomIndex(3, 1, 0.99)).toBe(2);
    expect(getRandomIndex(1, 0, 0.5)).toBe(0);
  });
});
