import { describe, expect, it } from "vitest";
import { hoverExpandId } from "../components/shell/workspaceHoverExpand";

describe("hoverExpandId", () => {
  it("opens a collapsed folder under the pointer", () => {
    expect(hoverExpandId("folder-a", { "folder-a": true })).toBe("folder-a");
  });

  it("ignores already open folders and reserved drop ids", () => {
    expect(hoverExpandId("folder-a", { "folder-a": false })).toBeNull();
    expect(hoverExpandId("root", { root: true })).toBeNull();
    expect(hoverExpandId("inbox", { inbox: true })).toBeNull();
    expect(hoverExpandId(null, { "folder-a": true })).toBeNull();
  });
});
