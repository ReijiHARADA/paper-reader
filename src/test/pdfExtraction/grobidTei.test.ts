import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGrobidHeaderTei } from "../../services/pdfExtraction/grobid/tei";
import { grobidBaseUrl } from "../../services/pdfExtraction/grobid/client";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

describe("GROBID TEI header parser", () => {
  it("extracts title, authors, affiliations, and links from fixture TEI", () => {
    const xml = fs.readFileSync(
      path.join(root, "test-fixtures/pdf-extraction/grobid-header.tei.xml"),
      "utf8"
    );
    const header = parseGrobidHeaderTei(xml);
    expect(header.title).toBe("Interactive Jewellery: a design exploration");
    expect(header.authors).toContain("Maarten Versteeg");
    expect(header.affiliations).toContain("Eindhoven University of Technology");
    expect(header.affiliations).toContain("University of Technology Sydney");
    expect(
      header.links.some(
        (link) =>
          link.author === "Caroline Humels" &&
          link.affiliation === "University of Technology Sydney"
      )
    ).toBe(true);
    expect(header.abstract).toMatch(/design exploration/i);
  });

  it("does not default to a cloud GROBID host", () => {
    expect(grobidBaseUrl()).toBeNull();
  });
});
