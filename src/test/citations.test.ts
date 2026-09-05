import { describe, expect, it } from "vitest";
import { normalizeReferenceHref, parseReferenceLinks } from "../services/citations";

describe("parseReferenceLinks", () => {
  it("extracts https URLs and bare DOIs", () => {
    const text =
      "Smith. 2016. Widget. TOCHI. https://doi.org/10.1145/1234567. doi: 10.1007/s00779-009-0279-7";
    const links = parseReferenceLinks(text);
    expect(links.map((link) => link.href)).toEqual([
      "https://doi.org/10.1145/1234567",
      "https://doi.org/10.1007/s00779-009-0279-7",
    ]);
  });

  it("does not double-count a DOI already inside a URL", () => {
    const text = "See https://doi.org/10.1145/1234567 for details.";
    expect(parseReferenceLinks(text)).toHaveLength(1);
    expect(parseReferenceLinks(text)[0]?.href).toBe("https://doi.org/10.1145/1234567");
  });

  it("normalizes doi.org-less identifiers", () => {
    expect(normalizeReferenceHref("10.1145/2839462.2839504")).toBe(
      "https://doi.org/10.1145/2839462.2839504"
    );
  });
});
