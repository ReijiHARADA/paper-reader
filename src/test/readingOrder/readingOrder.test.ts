import { describe, expect, it } from "vitest";
import { reconstructDocument, type LayoutBlock, isEquationLine } from "../../services/pdfLayout";
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

describe("isEquationLine", () => {
  it("keeps a numbered displayed equation", () => {
    expect(isEquationLine("P = I × V ± Δ (1)")).toBe(true);
  });

  it("rejects hyphenated English, query strings, and bibliography URLs", () => {
    const samples = [
      "take into account a jewellery-, memory- and interaction-",
      "not yet been worn as ‘jewellery-to-be’ and states ‘the term ‘jewellery-to-be’ also carries with it notions of the jewel",
      "Unger-de Boer formulated a multi-disciplinary framework",
      "The jewellery-, interaction- and memory-perspective",
      "implications of this from a jewellery-, interaction- and",
      "interaction-, jewellery- and memory-perspective.",
      "on the hand-palm-side of the ring. To take a picture one",
      "rather expect a rubbing- or polishing-like action. The",
      "is a dot on the milky-way-like interface of the uploading",
      "integrate the jewellery-, interaction- and memory-",
      "proposals uses state-of-the-art technology when it comes to",
      "qualities, instead of using state-of-the-art technology",
      "golsteijn.pdf?ip=131.155.2.68&id=2639194&acc=AC",
      "CFID=556020003&CFTOKEN=28091657&__acm__=",
      "http://www.tednoten.com/work/portfolio/haunted-by-",
      "153–169. http://doi.org/10.1007/s00779-009-0279-7",
      "https://www.artefactgroup.com/content/work/purple-awearable-locket-for-the-21st-century/",
    ];
    for (const sample of samples) {
      expect(isEquationLine(sample), sample).toBe(false);
    }
  });
});

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
    const note = blocks.find((b) => b.role === "footnote");
    expect(note?.text).toContain("FOOTNOTE_MARK");
    const mixed = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /FOOTNOTE_MARK/.test(b.text) &&
        /FOOT_L1/.test(b.text)
    );
    expect(mixed).toBeUndefined();
  });

  it("table caption stays a table_caption block", () => {
    const { blocks } = reconstructDocument(FIXTURES["table-caption"]());
    const caption = blocks.find((b) => b.role === "table_caption");
    expect(caption?.text).toContain("Table 1");
    expect(
      blocks.some((b) => b.role === "paragraph" && /Table 1/.test(b.text) && /TABLE_L1/.test(b.text))
    ).toBe(false);
  });

  it("displayed equation is not absorbed into a paragraph", () => {
    const { blocks } = reconstructDocument(FIXTURES["equation"]());
    const equation = blocks.find((b) => b.role === "equation");
    expect(equation?.text).toMatch(/P = I/);
    expect(
      blocks.some((b) => b.role === "paragraph" && /P = I/.test(b.text) && /EQ_L1/.test(b.text))
    ).toBe(false);
  });

  it("does not treat a sentence starting with Figure N, as a caption", () => {
    const { blocks } = reconstructDocument(FIXTURES["false-caption-sentence"]());
    expect(blocks.some((b) => b.role === "figure_caption")).toBe(false);
    expect(
      joined(bodyBlocks(blocks))
    ).toMatch(/Figure 2, the body itself blocks/);
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

  it("page-1 title is a title, not a heading, and emails stay in the masthead", () => {
    const { blocks } = reconstructDocument(FIXTURES["ACM-style-two-column"]());
    const title = blocks.find((b) => b.role === "title");
    expect(title?.text).toMatch(/ACMSTYLE Interactive Jewelry/);
    expect(
      blocks.some(
        (b) => b.role === "heading" && /ACMSTYLE Interactive Jewelry/.test(b.text)
      )
    ).toBe(false);
    expect(
      blocks.some((b) => b.role === "heading" && /@example\.ac\.uk/.test(b.text))
    ).toBe(false);
    expect(blocks.some((b) => b.role === "author" && /Ada Lovelace/.test(b.text))).toBe(
      true
    );
    expect(
      blocks.some((b) => b.role === "affiliation" && /University of Example/.test(b.text))
    ).toBe(true);
  });

  it("hyphenated English and bibliography URLs are not displayed equations", () => {
    const { blocks } = reconstructDocument(FIXTURES["hyphenated-prose"]());
    expect(blocks.some((b) => b.role === "equation")).toBe(false);
    const prose = blocks.find(
      (b) =>
        b.role === "paragraph" &&
        /jewellery-, memory- and interaction-/.test(b.text)
    );
    expect(prose?.text).toMatch(/interaction-perspectives/);
    expect(
      blocks.some(
        (b) => b.role === "paragraph" && /Unger-de Boer formulated/.test(b.text)
      )
    ).toBe(true);
    expect(
      blocks.some((b) => b.role === "paragraph" && /doi\.org\/10\.1007/.test(b.text))
    ).toBe(true);
  });

  it("ACM classification catalog lines are paragraphs, not section headings", () => {
    const { blocks } = reconstructDocument(FIXTURES["classification-index"]());
    const catalog = blocks.find((b) => /H\.5\.m/.test(b.text));
    expect(catalog?.role).toBe("paragraph");
    expect(
      blocks.some((b) => b.role === "heading" && /H\.5\.m/.test(b.text))
    ).toBe(false);
    expect(
      blocks.some(
        (b) =>
          b.role === "heading" && /^ACM Classification Keywords$/i.test(b.text.trim())
      )
    ).toBe(true);
    const prose = blocks.find((b) => /CLASSIFIX_INTRO/.test(b.text));
    expect(prose?.role).toBe("paragraph");
  });

  it("every named fixture produces at least one block", () => {
    for (const [name, build] of Object.entries(FIXTURES)) {
      const { blocks } = reconstructDocument(build());
      expect(blocks.length, name).toBeGreaterThan(0);
    }
  });
});
