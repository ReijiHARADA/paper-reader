import { describe, expect, it } from "vitest";
import { clampPopoverPosition } from "../../components/reader/memo/popoverPosition";

const viewport = { width: 1000, height: 800 };

describe("clampPopoverPosition", () => {
  it("places the popover below a mid-screen selection", () => {
    const placed = clampPopoverPosition(
      { top: 200, left: 400, width: 80, height: 20 },
      { width: 320, height: 160 },
      viewport
    );
    expect(placed.top).toBe(228);
    expect(placed.left).toBeGreaterThanOrEqual(12);
    expect(placed.left + 320).toBeLessThanOrEqual(988);
  });

  it("flips above when there is no room below", () => {
    const placed = clampPopoverPosition(
      { top: 720, left: 400, width: 80, height: 20 },
      { width: 320, height: 160 },
      viewport
    );
    expect(placed.top).toBeLessThan(720);
    expect(placed.top + 160).toBeLessThanOrEqual(720);
  });

  it("keeps the popover inside the viewport near the right edge", () => {
    const placed = clampPopoverPosition(
      { top: 120, left: 940, width: 40, height: 16 },
      { width: 320, height: 160 },
      viewport
    );
    expect(placed.left + 320).toBeLessThanOrEqual(988);
    expect(placed.left).toBeGreaterThanOrEqual(12);
  });
});
