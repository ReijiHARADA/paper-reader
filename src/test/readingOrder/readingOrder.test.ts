import { describe, expect, it } from "vitest";
import { reconstructDocument, type LayoutBlock } from "../../services/pdfLayout";
import { FIXTURES } from "./builders";

function tokensInOrder(haystack: string, tokens: string[]): void {
  let from = 0;
  for (const token of tokens) {
    const idx = haystack.indexOf(token, from);
    expect(idx, `expected ${token} after previous token`).toBeGreaterThanOrEqual(0);
    from = idx + token.length;
  }
}

function joined(blocks: LayoutBlock[]): string {
  return blocks.map((b) => b.text).join("\n");
}

function bodyBlocks(blocks: LayoutBlock[]): LayoutBlock[] {
  return blocks.filter(
    (b) => b.role !== "header" && b.role !== "footer" && b.role !== "copyright"
  );
}

/** Left/right lines must not alternate one-by-one on a simple two-column page. */
function columnRuns(blocks: LayoutBlock[]): string[] {
  return bodyBlocks(blocks)
    .filter((b) => b.column === "left" || b.column === "right")
    .map((b) => b.column);
}

function assertNoLineInterleave(runs: string[]): void {
  const compact: string[] = [];
  for (const col of runs) {
    if (compact[compact.length - 1] !== col) compact.push(col);
  }
  const flips = compact.length;
  expect(
    flips,
    `column sequence ${runs.join(",")} looks interleaved`
  ).toBeLessThanOrEqual(4);
}

describe("PDF reading order regression", () => {
  it("single-column keeps linear order", () => {
    const { blocks } = reconstructDocument(FIXTURES["single-column"]());
    const text = joined(bodyBlocks(blocks));
    tokensInOrder(text, ["SINGLECOL_P1", "SINGLECOL_P2", "SINGLECOL_P3"]);
    expect(blocks.some((b) => b.column === "left" && b.role === "paragraph")).toBe(
      false
    );
  });

  it("basic-two-column reads left column then right column", () => {
    const { blocks, layouts } = reconstructDocument(
      FIXTURES["basic-two-column"]()
    );
    expect(layouts[0]?.isMultiColumn).toBe(true);
    const text = joined(bodyBlocks(blocks));
    tokensInOrder(text, [
      "LEFTCOL_A",
      "LEFTCOL_H",
      "RIGHTCOL_A",
      "RIGHTCOL_H",
    ]);
    expect(text.indexOf("RIGHTCOL_A")).toBeGreaterThan(text.indexOf("LEFTCOL_H"));
    assertNoLineInterleave(columnRuns(blocks));
  });

  it("ACM-style two-column keeps spanning masthead then left then right", () => {
    const { blocks, layouts } = reconstructDocument(
      FIXTURES["ACM-style-two-column"]()
    );
    expect(layouts[0]?.isMultiColumn).toBe(true);
    const text = joined(bodyBlocks(blocks));
    tokensInOrder(text, [
      "ACMSTYLE Interactive",
      "ACMSTYLE_ABS",
      "ACMSTYLE_L1",
      "ACMSTYLE_L8",
      "ACMSTYLE_R1",
      "ACMSTYLE_R8",
    ]);
    assertNoLineInterleave(columnRuns(blocks));
  });

  it("full-width title is spanning and not absorbed into a column paragraph", () => {
    const { blocks } = reconstructDocument(FIXTURES["full-width-title"]());
    const title = blocks.find((b) => b.role === "title");
    expect(title?.text).toMatch(/ACMSTYLE Interactive Jewelry/);
    expect(title?.column === "spanning" || title?.column === "single").toBe(true);
    const mixed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /ACMSTYLE Interactive Jewelry/.test(b.text) &&
        /ACMSTYLE_L1/.test(b.text)
    );
    expect(mixed).toBeUndefined();
  });

  it("full-width figure caption is not mixed into body paragraphs", () => {
    const { blocks } = reconstructDocument(FIXTURES["full-width-figure"]());
    const caption = blocks.find((b) => b.role === "figure_caption");
    expect(caption?.text).toContain("FWFIG_CAPTION");
    const text = joined(bodyBlocks(blocks));
    tokensInOrder(text, ["FWFIG_L8", "FWFIG_R8", "FWFIG_CAPTION", "FWFIG_L9"]);
    const mixed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /FWFIG_CAPTION/.test(b.text) &&
        /FWFIG_L1|FWFIG_R1/.test(b.text)
    );
    expect(mixed).toBeUndefined();
  });

  it("figure inside a column stays in that column and is not body text", () => {
    const { blocks } = reconstructDocument(
      FIXTURES["figure-inside-column"]()
    );
    const caption = blocks.find((b) => b.role === "figure_caption");
    expect(caption?.text).toContain("FIGCOL_CAPTION");
    expect(caption?.column).toBe("left");
    const mixed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /FIGCOL_CAPTION/.test(b.text) &&
        /FIGCOL_R1/.test(b.text)
    );
    expect(mixed).toBeUndefined();
    const text = joined(bodyBlocks(blocks));
    expect(text.indexOf("FIGCOL_L1")).toBeLessThan(text.indexOf("FIGCOL_CAPTION"));
    expect(text.indexOf("FIGCOL_CAPTION")).toBeLessThan(text.indexOf("FIGCOL_L3"));
  });

  it("complex first page drops header/footer/copyright from body", () => {
    const { blocks } = reconstructDocument(FIXTURES["complex-first-page"]());
    const text = joined(blocks);
    expect(text).not.toMatch(/Proceedings of TEI 2024/);
    expect(
      blocks.some(
        (b) =>
          (b.role === "paragraph" || b.role === "heading") &&
          /Permission to make digital or hard copies/.test(b.text)
      )
    ).toBe(false);
    const body = joined(bodyBlocks(blocks));
    expect(body).toContain("COMPLEX_ABS");
    expect(body).toContain("COMPLEX_L1");
    expect(body).toContain("COMPLEX_R1");
    tokensInOrder(body, ["COMPLEX_L8", "COMPLEX_R1"]);
  });

  it("footnote is not merged into mid-column body", () => {
    const { blocks } = reconstructDocument(FIXTURES["footnote"]());
    const text = joined(bodyBlocks(blocks));
    expect(text).toContain("FOOTNOTE_MARK");
    const mixed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /FOOTNOTE_MARK/.test(b.text) &&
        /FOOT_L1/.test(b.text)
    );
    expect(mixed).toBeUndefined();
  });

  it("references heading is not absorbed into a paragraph", () => {
    const { blocks } = reconstructDocument(FIXTURES["references"]());
    const heading = blocks.find(
      (b) => b.role === "heading" && /^references$/i.test(b.text.trim())
    );
    expect(heading).toBeDefined();
    const absorbed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /References/.test(b.text) &&
        /REF_BODY/.test(b.text)
    );
    expect(absorbed).toBeUndefined();
    const bibAsHeading = blocks.find(
      (b) => b.role === "heading" && /REFENTRY_/.test(b.text)
    );
    expect(bibAsHeading).toBeUndefined();
  });

  it("does not treat a wrapped grant number as a section heading", () => {
    const { blocks } = reconstructDocument(FIXTURES["acknowledgment-grant"]());
    const grantHeading = blocks.find(
      (b) => b.role === "heading" && /016\.128\.303/.test(b.text)
    );
    expect(grantHeading).toBeUndefined();
    const support = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /STW VIDI grant number/.test(b.text) &&
        /016\.128\.303/.test(b.text)
    );
    expect(support).toBeDefined();
    expect(support?.text).toContain("Elise van den Hoven");
    const ackHeading = blocks.find(
      (b) => b.role === "heading" && /^acknowledgements?$/i.test(b.text.trim())
    );
    expect(ackHeading).toBeDefined();
  });

  it("every named fixture produces at least one block", () => {
    for (const [name, build] of Object.entries(FIXTURES)) {
      const { blocks } = reconstructDocument(build());
      expect(blocks.length, name).toBeGreaterThan(0);
    }
  });
});
