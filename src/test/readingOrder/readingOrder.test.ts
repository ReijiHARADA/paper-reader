import { describe, expect, it } from "vitest";
import { reconstructDocument, type LayoutBlock, isEquationLine, isFigureCaption, isTableCaption } from "../../services/pdfLayout";
import type { ExtractedPage } from "../../services/pdfService";
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

describe("Japanese figure and table captions", () => {
  it("recognizes 図 and 表 captions but not in-sentence 図 N の", () => {
    expect(isFigureCaption("図 1: 視聴覚情報処理過程と記憶に関する認知モデル")).toBe(
      true
    );
    expect(isFigureCaption("図1：先行研究で利用された映像の一例")).toBe(true);
    expect(isFigureCaption("Figure 2. A workshop layout.")).toBe(true);
    expect(isFigureCaption("Fig. 1, The general areas for wearable objects")).toBe(true);
    expect(isFigureCaption("Figure 3, Even simple motions change body shape")).toBe(true);
    expect(isFigureCaption("図 3 の1行目に示す応答")).toBe(false);
    expect(isTableCaption("表 1: 被験者の内訳")).toBe(true);
    expect(isTableCaption("Table 1. Participant demographics")).toBe(true);
  });
});

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
  it("stitches an unambiguously continued paragraph across adjacent pages", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 5, width: 612, height: 792, textItems: [{ text: "PAGE_END Examination of the distribution of targets showed errors. One", x: 54, y: 704, width: 500, height: 10, fontSize: 10, fontName: "Helvetica", page: 5 }] },
      { pageNumber: 6, width: 612, height: 792, textItems: [{ text: "exception to this is the low miss rate under the controlled condition.", x: 54, y: 86, width: 500, height: 10, fontSize: 10, fontName: "Helvetica", page: 6 }] },
    ];
    const { blocks } = reconstructDocument(pages);
    const stitched = blocks.find((block) => block.text.includes("PAGE_END"));
    expect(stitched?.text).toContain("One exception to this");
    expect(stitched?.pageStart).toBe(5);
    expect(stitched?.pageEnd).toBe(6);
  });

  it("does not join an independent capitalized paragraph on the next page", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 5, width: 612, height: 792, textItems: [{ text: "PAGE_END The prior paragraph ends without a terminal mark", x: 54, y: 704, width: 500, height: 10, fontSize: 10, fontName: "Helvetica", page: 5 }] },
      { pageNumber: 6, width: 612, height: 792, textItems: [{ text: "Independent evidence begins a new paragraph with a capital letter.", x: 54, y: 86, width: 500, height: 10, fontSize: 10, fontName: "Helvetica", page: 6 }] },
    ];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.filter((block) => block.role === "paragraph")).toHaveLength(2);
    expect(joined(blocks)).not.toContain("mark Independent evidence");
  });

  it("keeps an inline publisher-date annotation out of a body line", () => {
    const page: ExtractedPage = {
      pageNumber: 1,
      width: 595,
      height: 782,
      textItems: [
        { text: "MARGIN_BODY_A Recent research suggests that", x: 155, y: 273, width: 378, height: 9, fontSize: 9, fontName: "Body", page: 1 },
        { text: "Published: xx xx xxxx", x: 9, y: 277, width: 76, height: 8.5, fontSize: 8.5, fontName: "Meta", page: 1 },
        { text: "MARGIN_BODY_B the experiment evaluates the proposed method without metadata in the prose.", x: 155, y: 284, width: 382, height: 9, fontSize: 9, fontName: "Body", page: 1 },
      ],
    };
    const { blocks } = reconstructDocument([page]);
    const text = joined(blocks);
    expect(text).not.toContain("Published: xx xx xxxx");
    expect(text).toContain("MARGIN_BODY_A");
    expect(text).toContain("MARGIN_BODY_B");
  });

  it("keeps an attached numbered small-type footnote out of body prose", () => {
    const textItems = [
      { text: "Body paragraph with enough ordinary content to establish body type and layout.", x: 54, y: 560, width: 480, height: 10, fontSize: 10, fontName: "Helvetica", page: 1 },
      { text: "1Please contact the corresponding author for supplementary study material.", x: 54, y: 710, width: 480, height: 7, fontSize: 7, fontName: "Helvetica", page: 1 },
      { text: "Further footnote details remain in the same small type.", x: 54, y: 719, width: 480, height: 7, fontSize: 7, fontName: "Helvetica", page: 1 },
    ];
    const { blocks } = reconstructDocument([{ pageNumber: 1, width: 612, height: 792, textItems }]);
    const note = blocks.find((block) => block.text.startsWith("1Please contact"));
    expect(note?.role).toBe("footnote");
    expect(blocks.some((block) => block.role === "paragraph" && block.text.startsWith("1Please contact"))).toBe(false);
  });

  it("splits a body-style heading that is repeated at the start of its following prose", () => {
    const textItems = [
      "Vignette-based investigations",
      "For the vignette-based investigations, we collected canonical scenarios and recorded the model response.",
      "The following sentence continues the ordinary body paragraph with enough words for stable layout classification.",
    ].map((text, index) => ({
      text,
      x: 54,
      y: 120 + index * 12,
      width: 500,
      height: 11,
      fontSize: 10,
      fontName: "Helvetica",
      page: 2,
    }));
    const pages: ExtractedPage[] = [{ pageNumber: 2, width: 612, height: 792, textItems }];
    const { blocks } = reconstructDocument(pages);
    expect(blocks.find((block) => block.text === "Vignette-based investigations")?.role).toBe("heading");
    expect(blocks.some((block) => block.role === "paragraph" && block.text.startsWith("For the vignette-based investigations"))).toBe(true);
  });

  it("does not split ordinary prose which merely repeats a phrase later in the sentence", () => {
    const textItems = [
      "The Vignette-based investigations include several scenarios that are compared in the experiment.",
      "For the vignette-based investigations, participants recorded a response after each scenario.",
    ].map((text, index) => ({ text, x: 54, y: 120 + index * 12, width: 500, height: 11, fontSize: 10, fontName: "Helvetica", page: 1 }));
    const { blocks } = reconstructDocument([{ pageNumber: 1, width: 612, height: 792, textItems }]);
    expect(blocks.filter((block) => block.role === "heading")).toHaveLength(0);
  });

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

  it("Japanese conference papers get numbered headings, 図 captions, and authors", () => {
    const { blocks } = reconstructDocument(FIXTURES["japanese-conference"]());
    const headings = blocks.filter((b) => b.role === "heading").map((b) => b.text);
    expect(headings.some((t) => /1 はじめに/.test(t))).toBe(true);
    expect(headings.some((t) => /2\.1 視聴覚情報処理と記憶/.test(t))).toBe(true);
    expect(headings.some((t) => /2\.2 関連研究/.test(t))).toBe(true);
    expect(headings.some((t) => /^参考文献$/.test(t.trim()))).toBe(true);
    expect(
      headings.some((t) => /Acquisition process of visual-auditory/.test(t))
    ).toBe(false);
    expect(headings.some((t) => /Kurihara Yuta/.test(t))).toBe(false);
    expect(headings.some((t) => /視線誘導部から情報付加部/.test(t))).toBe(false);

    const caption = blocks.find((b) => b.role === "figure_caption");
    expect(caption?.text).toContain("JACAPTION");
    expect(blocks.some((b) => b.role === "table_caption" && /JATABLE/.test(b.text))).toBe(
      true
    );
    expect(
      blocks.some(
        (b) => b.role === "figure_caption" && /図 3 の1行目/.test(b.text)
      )
    ).toBe(false);

    expect(blocks.some((b) => b.role === "author" && /栗原 勇太/.test(b.text))).toBe(
      true
    );
    expect(blocks.some((b) => b.role === "title" && /情報採餌理論/.test(b.text))).toBe(
      true
    );
    expect(
      blocks.some(
        (b) =>
          (b.role === "paragraph" || b.role === "heading") && /^J-040$/.test(b.text.trim())
      )
    ).toBe(false);
  });

  it("every named fixture produces at least one block", () => {
    for (const [name, build] of Object.entries(FIXTURES)) {
      const { blocks } = reconstructDocument(build());
      expect(blocks.length, name).toBeGreaterThan(0);
    }
  });
});
