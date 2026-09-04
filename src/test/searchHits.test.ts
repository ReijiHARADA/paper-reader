import { describe, expect, it } from "vitest";
import { wrapSearchHitIndex } from "../utils/searchHits";

describe("wrapSearchHitIndex", () => {
  it("moves forward and wraps to the first hit", () => {
    expect(wrapSearchHitIndex(0, 3, 1)).toBe(1);
    expect(wrapSearchHitIndex(2, 3, 1)).toBe(0);
  });

  it("moves backward and wraps to the last hit", () => {
    expect(wrapSearchHitIndex(0, 3, -1)).toBe(2);
  });

  it("stays at 0 when there are no hits", () => {
    expect(wrapSearchHitIndex(0, 0, 1)).toBe(0);
  });
});
