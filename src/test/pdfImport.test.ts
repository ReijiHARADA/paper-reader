import { describe, expect, it } from "vitest";
import {
  firstPdfPath,
  importWorkspaceNodeIdFromLocation,
  isPdfFilename,
} from "../services/pdfImport";

describe("pdfImport helpers", () => {
  it("accepts pdf filenames regardless of case", () => {
    expect(isPdfFilename("paper.pdf")).toBe(true);
    expect(isPdfFilename("paper.PDF")).toBe(true);
    expect(isPdfFilename("notes.txt")).toBe(false);
  });

  it("picks the first pdf path from a dropped list", () => {
    expect(
      firstPdfPath(["/tmp/notes.txt", "/tmp/study.PDF", "/tmp/other.pdf"])
    ).toBe("/tmp/study.PDF");
    expect(firstPdfPath(["/tmp/notes.txt"])).toBeNull();
  });

  it("uses the open project for import membership", () => {
    expect(importWorkspaceNodeIdFromLocation("/project/abc", "")).toBe("abc");
    expect(importWorkspaceNodeIdFromLocation("/reader/p1", "?workspace=xyz")).toBe("xyz");
    expect(importWorkspaceNodeIdFromLocation("/", "")).toBeUndefined();
  });
});
