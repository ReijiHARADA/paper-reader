import type { ExtractedPage, ExtractedTextItem } from "../../services/pdfService";

export const LETTER = { width: 612, height: 792 };

function item(
  text: string,
  x: number,
  y: number,
  opts: {
    width?: number;
    height?: number;
    fontSize?: number;
    page?: number;
  } = {}
): ExtractedTextItem {
  const fontSize = opts.fontSize ?? 10;
  return {
    text,
    x,
    y,
    width: opts.width ?? Math.max(40, text.length * fontSize * 0.5),
    height: opts.height ?? fontSize * 1.15,
    fontSize,
    fontName: "Helvetica",
    page: opts.page ?? 1,
  };
}

function page(
  pageNumber: number,
  textItems: ExtractedTextItem[]
): ExtractedPage {
  return {
    pageNumber,
    width: LETTER.width,
    height: LETTER.height,
    textItems: textItems.map((t) => ({ ...t, page: pageNumber })),
  };
}

/** Long column line so detectPageColumns treats it as a column sample. */
function colLine(
  text: string,
  x: number,
  y: number,
  pageNumber = 1,
  fontSize = 10
): ExtractedTextItem {
  return item(text, x, y, { width: 240, fontSize, page: pageNumber });
}

const LEFT_X = 54;
const RIGHT_X = 318;

export function singleColumnPages(): ExtractedPage[] {
  const items: ExtractedTextItem[] = [
    item("SINGLECOL Title of the Paper About Widgets", 54, 80, {
      width: 500,
      fontSize: 18,
    }),
    item("Introduction", 54, 140, { width: 120, fontSize: 13 }),
    item(
      "SINGLECOL_P1 This opening paragraph explains the problem in a single column layout with enough words to look like body text for font detection.",
      54,
      170,
      { width: 500, fontSize: 10 }
    ),
    item(
      "SINGLECOL_P2 A second paragraph continues the argument without any competing column on the right side of the page.",
      54,
      230,
      { width: 500, fontSize: 10 }
    ),
    item(
      "SINGLECOL_P3 The method section would normally follow but this fixture stays simple and linear.",
      54,
      290,
      { width: 500, fontSize: 10 }
    ),
  ];
  return [page(1, items)];
}

export function basicTwoColumnPages(): ExtractedPage[] {
  const left = [
    colLine("Introduction", LEFT_X, 120, 1, 12),
    colLine(
      "LEFTCOL_A Wearable computing began as bulky prototypes worn on the body during early experiments.",
      LEFT_X,
      150
    ),
    colLine(
      "LEFTCOL_B Researchers then asked how jewelry and fashion might absorb computational materials.",
      LEFT_X,
      180
    ),
    colLine(
      "LEFTCOL_C This left column must be read completely before the right column starts.",
      LEFT_X,
      210
    ),
    colLine(
      "LEFTCOL_D Additional left-column sentences keep the cluster large enough for column detection.",
      LEFT_X,
      240
    ),
    colLine(
      "LEFTCOL_E More left text about sensors embedded in rings bracelets and necklaces.",
      LEFT_X,
      270
    ),
    colLine(
      "LEFTCOL_F The left column finishes with a complete sentence about craft practice.",
      LEFT_X,
      300
    ),
    colLine(
      "LEFTCOL_G Closing left paragraph remnant to satisfy the eight-item column heuristic.",
      LEFT_X,
      330
    ),
    colLine(
      "LEFTCOL_H Final left line about workshop methods and material studies.",
      LEFT_X,
      360
    ),
  ];
  const right = [
    colLine("Related Work", RIGHT_X, 120, 1, 12),
    colLine(
      "RIGHTCOL_A Prior systems treated ornament as an afterthought rather than a design material.",
      RIGHT_X,
      150
    ),
    colLine(
      "RIGHTCOL_B Fashion literature describes how surfaces communicate status and identity.",
      RIGHT_X,
      180
    ),
    colLine(
      "RIGHTCOL_C This right column should appear only after every left-column block.",
      RIGHT_X,
      210
    ),
    colLine(
      "RIGHTCOL_D Extra right-column sentences keep both peaks populated.",
      RIGHT_X,
      240
    ),
    colLine(
      "RIGHTCOL_E Jewelry historians document mechanisms hidden inside lockets.",
      RIGHT_X,
      270
    ),
    colLine(
      "RIGHTCOL_F Interaction design borrowed those mechanisms for playful devices.",
      RIGHT_X,
      300
    ),
    colLine(
      "RIGHTCOL_G The right column continues with discussion of related prototypes.",
      RIGHT_X,
      330
    ),
    colLine(
      "RIGHTCOL_H Final right line about exhibition contexts and wearer interviews.",
      RIGHT_X,
      360
    ),
  ];
  return [page(1, [...left, ...right])];
}

export function acmStyleTwoColumnPages(): ExtractedPage[] {
  const spanning = [
    item("ACMSTYLE Interactive Jewelry as Computational Craft", 54, 70, {
      width: 504,
      fontSize: 18,
    }),
    item("Ada Lovelace and Charles Babbage", 54, 100, {
      width: 280,
      fontSize: 11,
    }),
    item("ada@example.ac.uk  c.babbage@example.ac.uk", 54, 112, {
      width: 320,
      fontSize: 12,
    }),
    item("University of Example Department of Design", 54, 124, {
      width: 360,
      fontSize: 12,
    }),
    item("Abstract", 54, 150, { width: 90, fontSize: 12 }),
    item(
      "ACMSTYLE_ABS We present a study of jewelry-like wearables that people actually want to wear in daily life.",
      54,
      175,
      { width: 504, fontSize: 10 }
    ),
  ];
  const body = [
    colLine("Introduction", LEFT_X, 230, 1, 12),
    colLine(
      "ACMSTYLE_L1 The first column of an ACM paper starts after the abstract block.",
      LEFT_X,
      260
    ),
    colLine(
      "ACMSTYLE_L2 Left column body continues with motivation and research questions.",
      LEFT_X,
      290
    ),
    colLine(
      "ACMSTYLE_L3 Further left text about participants and workshop format.",
      LEFT_X,
      320
    ),
    colLine(
      "ACMSTYLE_L4 Left column still going so the detector sees a stable left peak.",
      LEFT_X,
      350
    ),
    colLine(
      "ACMSTYLE_L5 Another left sentence about materials brass silver and enamel.",
      LEFT_X,
      380
    ),
    colLine(
      "ACMSTYLE_L6 Left column keeps accumulating ordinary paragraph lines.",
      LEFT_X,
      410
    ),
    colLine(
      "ACMSTYLE_L7 Penultimate left line before we switch to the right column.",
      LEFT_X,
      440
    ),
    colLine(
      "ACMSTYLE_L8 Last left line of the ACM first-page body columns.",
      LEFT_X,
      470
    ),
    colLine(
      "ACMSTYLE_R1 Right column starts only after the left column is exhausted.",
      RIGHT_X,
      260
    ),
    colLine(
      "ACMSTYLE_R2 Right column discusses related craft and HCI literature.",
      RIGHT_X,
      290
    ),
    colLine(
      "ACMSTYLE_R3 More right text so the right peak is unambiguous.",
      RIGHT_X,
      320
    ),
    colLine(
      "ACMSTYLE_R4 Right column continues with method overview sentences.",
      RIGHT_X,
      350
    ),
    colLine(
      "ACMSTYLE_R5 Additional right-column body about analysis procedures.",
      RIGHT_X,
      380
    ),
    colLine(
      "ACMSTYLE_R6 Right column still has ordinary paragraph density.",
      RIGHT_X,
      410
    ),
    colLine(
      "ACMSTYLE_R7 Almost done with the right column of page one.",
      RIGHT_X,
      440
    ),
    colLine(
      "ACMSTYLE_R8 Final right ACM body line on this synthetic page.",
      RIGHT_X,
      470
    ),
  ];
  return [page(1, [...spanning, ...body])];
}

export function fullWidthTitlePages(): ExtractedPage[] {
  return acmStyleTwoColumnPages();
}

export function fullWidthFigurePages(): ExtractedPage[] {
  const topLeft = [
    colLine("Introduction", LEFT_X, 80, 1, 12),
    colLine("FWFIG_L1 Text above the full-width figure in the left column.", LEFT_X, 110),
    colLine("FWFIG_L2 More left text above the spanning figure band.", LEFT_X, 140),
    colLine("FWFIG_L3 Left column still above the figure.", LEFT_X, 170),
    colLine("FWFIG_L4 Fourth left line above the figure.", LEFT_X, 200),
    colLine("FWFIG_L5 Fifth left line above the figure.", LEFT_X, 230),
    colLine("FWFIG_L6 Sixth left line above the figure.", LEFT_X, 260),
    colLine("FWFIG_L7 Seventh left line above the figure.", LEFT_X, 290),
    colLine("FWFIG_L8 Eighth left line above the figure.", LEFT_X, 320),
  ];
  const topRight = [
    colLine("FWFIG_R1 Text above the figure in the right column.", RIGHT_X, 110),
    colLine("FWFIG_R2 More right text above the spanning figure.", RIGHT_X, 140),
    colLine("FWFIG_R3 Third right line above the figure.", RIGHT_X, 170),
    colLine("FWFIG_R4 Fourth right line above the figure.", RIGHT_X, 200),
    colLine("FWFIG_R5 Fifth right line above the figure.", RIGHT_X, 230),
    colLine("FWFIG_R6 Sixth right line above the figure.", RIGHT_X, 260),
    colLine("FWFIG_R7 Seventh right line above the figure.", RIGHT_X, 290),
    colLine("FWFIG_R8 Eighth right line above the figure.", RIGHT_X, 320),
  ];
  const figure = [
    item("Figure 1. FWFIG_CAPTION A full-width diagram of the workshop layout.", 54, 380, {
      width: 504,
      fontSize: 9,
    }),
  ];
  const bottomLeft = [
    colLine("FWFIG_L9 Left column resumes after the full-width figure.", LEFT_X, 430),
    colLine("FWFIG_L10 More left text below the spanning caption.", LEFT_X, 460),
    colLine("FWFIG_L11 Continue left below the figure.", LEFT_X, 490),
    colLine("FWFIG_L12 Left below figure still going.", LEFT_X, 520),
    colLine("FWFIG_L13 Another left line below the figure.", LEFT_X, 550),
    colLine("FWFIG_L14 Left column near the bottom.", LEFT_X, 580),
    colLine("FWFIG_L15 Penultimate left below figure.", LEFT_X, 610),
    colLine("FWFIG_L16 Last left line below the figure.", LEFT_X, 640),
  ];
  const bottomRight = [
    colLine("FWFIG_R9 Right column resumes after the full-width figure.", RIGHT_X, 430),
    colLine("FWFIG_R10 More right text below the spanning caption.", RIGHT_X, 460),
    colLine("FWFIG_R11 Continue right below the figure.", RIGHT_X, 490),
    colLine("FWFIG_R12 Right below figure still going.", RIGHT_X, 520),
    colLine("FWFIG_R13 Another right line below the figure.", RIGHT_X, 550),
    colLine("FWFIG_R14 Right column near the bottom.", RIGHT_X, 580),
    colLine("FWFIG_R15 Penultimate right below figure.", RIGHT_X, 610),
    colLine("FWFIG_R16 Last right line below the figure.", RIGHT_X, 640),
  ];
  return [page(1, [...topLeft, ...topRight, ...figure, ...bottomLeft, ...bottomRight])];
}

export function figureInsideColumnPages(): ExtractedPage[] {
  const left = [
    colLine("Method", LEFT_X, 80, 1, 12),
    colLine("FIGCOL_L1 Body text before an in-column figure caption.", LEFT_X, 110),
    colLine("FIGCOL_L2 More left body before the caption.", LEFT_X, 140),
    colLine("Figure 2. FIGCOL_CAPTION Prototype ring with a hidden latch.", LEFT_X, 190, 1, 9),
    colLine("FIGCOL_L3 Body text after the in-column figure caption.", LEFT_X, 240),
    colLine("FIGCOL_L4 Left column continues independently of the right.", LEFT_X, 270),
    colLine("FIGCOL_L5 Additional left text to keep the column populated.", LEFT_X, 300),
    colLine("FIGCOL_L6 Left column still has ordinary paragraphs.", LEFT_X, 330),
    colLine("FIGCOL_L7 Almost the end of the left column.", LEFT_X, 360),
    colLine("FIGCOL_L8 Final left paragraph after the figure.", LEFT_X, 390),
  ];
  const right = [
    colLine("FIGCOL_R1 Right column must not swallow the left caption.", RIGHT_X, 110),
    colLine("FIGCOL_R2 Right column discusses analysis of workshop notes.", RIGHT_X, 140),
    colLine("FIGCOL_R3 More right text at the same vertical band as the figure.", RIGHT_X, 190),
    colLine("FIGCOL_R4 Right column continues without the caption mixed in.", RIGHT_X, 240),
    colLine("FIGCOL_R5 Extra right sentences for column detection.", RIGHT_X, 270),
    colLine("FIGCOL_R6 Right column remains a coherent stream.", RIGHT_X, 300),
    colLine("FIGCOL_R7 Further right-column body text.", RIGHT_X, 330),
    colLine("FIGCOL_R8 Penultimate right line.", RIGHT_X, 360),
    colLine("FIGCOL_R9 Last right line of the in-column figure page.", RIGHT_X, 390),
  ];
  return [page(1, [...left, ...right])];
}

export function complexFirstPagePages(): ExtractedPage[] {
  const chrome = [
    item("Proceedings of TEI 2024 Conference on Tangible Embedded", 54, 20, {
      width: 400,
      fontSize: 8,
    }),
    item("1", 300, 770, { width: 10, fontSize: 8 }),
  ];
  const masthead = [
    item("COMPLEX First-Page Layout With Mixed Bands", 54, 70, {
      width: 504,
      fontSize: 18,
    }),
    item("Grace Hopper", 54, 100, { width: 140, fontSize: 11 }),
    item("Example Institute College of Computing", 54, 118, {
      width: 320,
      fontSize: 9,
    }),
    item(
      "Permission to make digital or hard copies of all or part of this work for personal or classroom use is granted.",
      54,
      700,
      { width: 504, fontSize: 7 }
    ),
  ];
  const rest = [
    item("Abstract", 54, 150, { width: 90, fontSize: 12 }),
    item(
      "COMPLEX_ABS This abstract spans the top of a busy first page before the two-column body.",
      54,
      175,
      { width: 504, fontSize: 10 }
    ),
    colLine("Introduction", LEFT_X, 230, 1, 12),
    colLine("COMPLEX_L1 Left column after abstract on a complex first page.", LEFT_X, 260),
    colLine("COMPLEX_L2 Left column continues with problem framing.", LEFT_X, 290),
    colLine("COMPLEX_L3 More left text about the study setting.", LEFT_X, 320),
    colLine("COMPLEX_L4 Left column still filling the detector sample.", LEFT_X, 350),
    colLine("COMPLEX_L5 Another left sentence for density.", LEFT_X, 380),
    colLine("COMPLEX_L6 Left column ordinary body.", LEFT_X, 410),
    colLine("COMPLEX_L7 Left column near mid page.", LEFT_X, 440),
    colLine("COMPLEX_L8 Last left complex-page body line.", LEFT_X, 470),
    colLine("COMPLEX_R1 Right column after all left complex-page lines.", RIGHT_X, 260),
    colLine("COMPLEX_R2 Right column related work sentences.", RIGHT_X, 290),
    colLine("COMPLEX_R3 More right text for the right peak.", RIGHT_X, 320),
    colLine("COMPLEX_R4 Right column method teaser.", RIGHT_X, 350),
    colLine("COMPLEX_R5 Additional right-column body.", RIGHT_X, 380),
    colLine("COMPLEX_R6 Right column continues.", RIGHT_X, 410),
    colLine("COMPLEX_R7 Almost the last right line.", RIGHT_X, 440),
    colLine("COMPLEX_R8 Final right complex-page body line.", RIGHT_X, 470),
  ];
  return [page(1, [...chrome, ...masthead, ...rest])];
}

export function footnotePages(): ExtractedPage[] {
  const left = [
    colLine("Discussion", LEFT_X, 80, 1, 12),
    colLine("FOOT_L1 Main left column text above the footnote band.", LEFT_X, 110),
    colLine("FOOT_L2 More main-column discussion of findings.", LEFT_X, 140),
    colLine("FOOT_L3 Left column continues as ordinary body.", LEFT_X, 170),
    colLine("FOOT_L4 Additional left body for column detection.", LEFT_X, 200),
    colLine("FOOT_L5 Left column still going.", LEFT_X, 230),
    colLine("FOOT_L6 Another left paragraph line.", LEFT_X, 260),
    colLine("FOOT_L7 Penultimate main left line.", LEFT_X, 290),
    colLine("FOOT_L8 Last main left line before the footnote.", LEFT_X, 320),
  ];
  const right = [
    colLine("FOOT_R1 Right column main text should stay separate.", RIGHT_X, 110),
    colLine("FOOT_R2 More right-column discussion.", RIGHT_X, 140),
    colLine("FOOT_R3 Right column continues.", RIGHT_X, 170),
    colLine("FOOT_R4 Extra right body lines.", RIGHT_X, 200),
    colLine("FOOT_R5 Right column density line.", RIGHT_X, 230),
    colLine("FOOT_R6 Right column still main text.", RIGHT_X, 260),
    colLine("FOOT_R7 Penultimate right main line.", RIGHT_X, 290),
    colLine("FOOT_R8 Last right main line.", RIGHT_X, 320),
  ];
  const footnote = [
    item("1 FOOTNOTE_MARK See workshop protocol for recruitment details.", 54, 740, {
      width: 480,
      fontSize: 8,
    }),
  ];
  return [page(1, [...left, ...right, ...footnote])];
}

export function referencesPages(): ExtractedPage[] {
  const body = [
    colLine("Introduction", LEFT_X, 80, 1, 12),
    colLine(
      "REF_BODY We showed that jewelry-like wearables can be designed with craft methods.",
      LEFT_X,
      110
    ),
    colLine("REF_BODY2 Future work will study longer wearing periods.", LEFT_X, 140),
    colLine("REF_BODY3 Left column filler for detection before references.", LEFT_X, 170),
    colLine("REF_BODY4 More left filler text about limitations.", LEFT_X, 200),
    colLine("REF_BODY5 Another left filler sentence.", LEFT_X, 230),
    colLine("REF_BODY6 Left column still before the references heading.", LEFT_X, 260),
    colLine("REF_BODY7 Penultimate left body line.", LEFT_X, 290),
    colLine("REF_BODY8 Last left body line.", LEFT_X, 320),
    colLine("REF_RIGHT1 Right column body before references.", RIGHT_X, 110),
    colLine("REF_RIGHT2 More right filler.", RIGHT_X, 140),
    colLine("REF_RIGHT3 Right column continues.", RIGHT_X, 170),
    colLine("REF_RIGHT4 Extra right lines.", RIGHT_X, 200),
    colLine("REF_RIGHT5 Right density.", RIGHT_X, 230),
    colLine("REF_RIGHT6 Right still body.", RIGHT_X, 260),
    colLine("REF_RIGHT7 Right almost done.", RIGHT_X, 290),
    colLine("REF_RIGHT8 Last right body line.", RIGHT_X, 320),
  ];
  const refs = [
    item("References", LEFT_X, 380, { width: 120, fontSize: 12 }),
    item("1. Martin A. Conway, 1990, Autobiographical Memory, REFENTRY_A.", LEFT_X, 410, {
      width: 240,
      fontSize: 9,
    }),
    item("2. Jane E. Smith and John R. Doe, 2018, Craft HCI, REFENTRY_B.", LEFT_X, 440, {
      width: 240,
      fontSize: 9,
    }),
    item("6. Martin A. Conway and someone else, 2005, REFENTRY_C.", LEFT_X, 470, {
      width: 240,
      fontSize: 9,
    }),
  ];
  return [page(1, [...body, ...refs])];
}

export function acknowledgmentGrantPages(): ExtractedPage[] {
  return [
    page(1, [
      item("Materialising Memories Title Line", 54, 56, {
        width: 420,
        fontSize: 18,
      }),
      item("Abstract", 54, 100, { width: 80, fontSize: 12 }),
      item(
        "ABSTRACT_BODY This paper discusses memory tools with enough words for body font detection.",
        54,
        120,
        { width: 500, fontSize: 10 }
      ),
      item("Acknowledgements", 54, 200, { width: 180, fontSize: 13 }),
      item("This research was supported by STW VIDI grant number", 54, 230, {
        width: 500,
        fontSize: 10,
      }),
      item("016.128.303", 54, 248, { width: 90, fontSize: 12 }),
      item("Research (NWO), awarded to Elise van den Hoven.", 54, 266, {
        width: 500,
        fontSize: 10,
      }),
      item(
        "We would like to thank everyone involved with the design concepts, especially the students and their supervisors.",
        54,
        310,
        { width: 500, fontSize: 10 }
      ),
    ]),
  ];
}

export function tableCaptionPages(): ExtractedPage[] {
  const left = [
    colLine("Results", LEFT_X, 80, 1, 12),
    colLine("TABLE_L1 Body text before the table caption in the left column.", LEFT_X, 110),
    colLine("TABLE_L2 More left body so column detection has density.", LEFT_X, 140),
    colLine("TABLE_L3 Left column continues with ordinary discussion.", LEFT_X, 170),
    colLine("TABLE_L4 Additional left body for the detector sample.", LEFT_X, 200),
    colLine("TABLE_L5 Left column still going before the table.", LEFT_X, 230),
    colLine("TABLE_L6 Another left paragraph line about findings.", LEFT_X, 260),
    colLine("TABLE_L7 Penultimate left body line.", LEFT_X, 290),
    colLine("TABLE_L8 Last left body line.", LEFT_X, 320),
  ];
  const right = [
    colLine("TABLE_R1 Right column body stays separate from the table.", RIGHT_X, 110),
    colLine("TABLE_R2 More right-column discussion.", RIGHT_X, 140),
    colLine("TABLE_R3 Right column continues.", RIGHT_X, 170),
    colLine("TABLE_R4 Extra right body lines.", RIGHT_X, 200),
    colLine("TABLE_R5 Right column density line.", RIGHT_X, 230),
    colLine("TABLE_R6 Right column still main text.", RIGHT_X, 260),
    colLine("TABLE_R7 Penultimate right main line.", RIGHT_X, 290),
    colLine("TABLE_R8 Last right main line.", RIGHT_X, 320),
  ];
  const table = [
    item("Table 1. Participant demographics for the jewellery study.", 54, 520, {
      width: 500,
      fontSize: 9,
    }),
  ];
  return [page(1, [...left, ...right, ...table])];
}

export function equationPages(): ExtractedPage[] {
  const left = [
    colLine("Method", LEFT_X, 80, 1, 12),
    colLine("EQ_L1 We model received power with the following relation.", LEFT_X, 110),
    colLine("EQ_L2 Left column body before the displayed equation.", LEFT_X, 140),
    colLine("EQ_L3 Additional left body for column detection.", LEFT_X, 170),
    colLine("EQ_L4 Left column still filling the detector sample.", LEFT_X, 200),
    colLine("EQ_L5 Another left sentence for density.", LEFT_X, 230),
    colLine("EQ_L6 Left column ordinary body.", LEFT_X, 260),
    colLine("P = I × V ± Δ (1)", LEFT_X, 300, 1, 11),
    colLine("EQ_L8 Left column continues after the equation.", LEFT_X, 340),
  ];
  const right = [
    colLine("EQ_R1 Right column should not absorb the equation.", RIGHT_X, 110),
    colLine("EQ_R2 More right-column discussion.", RIGHT_X, 140),
    colLine("EQ_R3 Right column continues.", RIGHT_X, 170),
    colLine("EQ_R4 Extra right body lines.", RIGHT_X, 200),
    colLine("EQ_R5 Right column density line.", RIGHT_X, 230),
    colLine("EQ_R6 Right column still main text.", RIGHT_X, 260),
    colLine("EQ_R7 Penultimate right main line.", RIGHT_X, 290),
    colLine("EQ_R8 Last right main line.", RIGHT_X, 320),
  ];
  return [page(1, [...left, ...right])];
}

export function falseCaptionSentencePages(): ExtractedPage[] {
  const left = [
    colLine("Related Work", LEFT_X, 80, 1, 12),
    colLine("FALSECAP_L1 Prior systems treated ornament as an afterthought.", LEFT_X, 110),
    colLine("FALSECAP_L2 More left body for column detection density.", LEFT_X, 140),
    colLine("FALSECAP_L3 Left column continues with ordinary discussion.", LEFT_X, 170),
    colLine("FALSECAP_L4 Additional left body for the detector sample.", LEFT_X, 200),
    colLine("FALSECAP_L5 Left column still going.", LEFT_X, 230),
    colLine("FALSECAP_L6 Another left paragraph line.", LEFT_X, 260),
    colLine("FALSECAP_L7 Penultimate left body line.", LEFT_X, 290),
    colLine(
      "Figure 2, the body itself blocks high-frequency RF signals around the torso.",
      LEFT_X,
      320
    ),
  ];
  const right = [
    colLine("FALSECAP_R1 Right column body stays separate.", RIGHT_X, 110),
    colLine("FALSECAP_R2 More right-column discussion.", RIGHT_X, 140),
    colLine("FALSECAP_R3 Right column continues.", RIGHT_X, 170),
    colLine("FALSECAP_R4 Extra right body lines.", RIGHT_X, 200),
    colLine("FALSECAP_R5 Right column density line.", RIGHT_X, 230),
    colLine("FALSECAP_R6 Right column still main text.", RIGHT_X, 260),
    colLine("FALSECAP_R7 Penultimate right main line.", RIGHT_X, 290),
    colLine("FALSECAP_R8 Last right main line.", RIGHT_X, 320),
  ];
  return [page(1, [...left, ...right])];
}

export function hyphenatedProsePages(): ExtractedPage[] {
  const left = [
    colLine("Introduction", LEFT_X, 80, 1, 12),
    colLine("HYPHEN_L1 Wearable computing began as bulky prototypes worn on the body.", LEFT_X, 110),
    colLine("HYPHEN_L2 Researchers then asked how jewelry and fashion might absorb computation.", LEFT_X, 140),
    colLine("take into account a jewellery-, memory- and interaction-", LEFT_X, 170),
    colLine("perspectives when developing wearables in daily life settings.", LEFT_X, 182),
    colLine("HYPHEN_L3 Unger-de Boer formulated a multi-disciplinary framework for craft.", LEFT_X, 230),
    colLine("HYPHEN_L4 Additional left text keeps the column detector sample populated.", LEFT_X, 260),
    colLine("HYPHEN_L5 Left column still going with ordinary body sentences here.", LEFT_X, 290),
    colLine("HYPHEN_L6 Another left paragraph line about workshop materials.", LEFT_X, 320),
    colLine("HYPHEN_L7 Penultimate left body line before we reach the right column.", LEFT_X, 350),
    colLine("HYPHEN_L8 Last left line about exhibition contexts and wearer interviews.", LEFT_X, 380),
  ];
  const right = [
    colLine("HYPHEN_R1 Right column body stays separate from hyphenated left prose.", RIGHT_X, 110),
    colLine("HYPHEN_R2 More right-column discussion of related prototypes.", RIGHT_X, 140),
    colLine("HYPHEN_R3 Right column continues with method teaser sentences.", RIGHT_X, 170),
    colLine("HYPHEN_R4 Extra right body lines keep the right peak populated.", RIGHT_X, 200),
    colLine("HYPHEN_R5 Right column density line about sensors in lockets.", RIGHT_X, 230),
    colLine("HYPHEN_R6 Right column still main text about craft practice.", RIGHT_X, 260),
    colLine("153–169. http://doi.org/10.1007/s00779-009-0279-7", RIGHT_X, 290),
    colLine("https://www.artefactgroup.com/content/work/purple-awearable-locket", RIGHT_X, 320),
  ];
  return [page(1, [...left, ...right])];
}

export function classificationIndexPages(): ExtractedPage[] {
  return [
    page(1, [
      item("CLASSIFIX Wearable Catalog Interfaces", 54, 70, {
        width: 500,
        fontSize: 18,
      }),
      item("Ada Lovelace", 54, 100, { width: 160, fontSize: 11 }),
      item("Abstract", 54, 140, { width: 90, fontSize: 13 }),
      item(
        "CLASSIFIX_ABS This abstract explains the study with enough body words for font detection and paragraph grouping on a single column page.",
        54,
        165,
        { width: 500, fontSize: 10 }
      ),
      item("Author Keywords", 54, 230, { width: 140, fontSize: 12 }),
      item(
        "Tangible interaction; interactive jewellery; autobiographical memory; memento.",
        54,
        250,
        { width: 500, fontSize: 10 }
      ),
      item("ACM Classification Keywords", 54, 280, { width: 220, fontSize: 12 }),
      item(
        "H.5.m. Information interfaces and presentation (e.g., HCI): Miscellaneous; H.5.2 User interfaces.",
        54,
        300,
        { width: 500, fontSize: 10 }
      ),
      item("Introduction", 54, 350, { width: 120, fontSize: 13 }),
      item(
        "CLASSIFIX_INTRO However, H.5.2 style interfaces are common in this field of research today and deserve a full translated paragraph.",
        54,
        375,
        { width: 500, fontSize: 10 }
      ),
    ]),
  ];
}

export const FIXTURES: Record<string, () => ExtractedPage[]> = {
  "single-column": singleColumnPages,
  "basic-two-column": basicTwoColumnPages,
  "ACM-style-two-column": acmStyleTwoColumnPages,
  "full-width-title": fullWidthTitlePages,
  "full-width-figure": fullWidthFigurePages,
  "figure-inside-column": figureInsideColumnPages,
  "complex-first-page": complexFirstPagePages,
  footnote: footnotePages,
  references: referencesPages,
  "acknowledgment-grant": acknowledgmentGrantPages,
  "table-caption": tableCaptionPages,
  equation: equationPages,
  "false-caption-sentence": falseCaptionSentencePages,
  "hyphenated-prose": hyphenatedProsePages,
  "classification-index": classificationIndexPages,
};

