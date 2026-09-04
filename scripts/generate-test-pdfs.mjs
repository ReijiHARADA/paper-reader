import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pdfDir = join(root, "test-fixtures/generated-pdfs");
const expectedDir = join(root, "test-fixtures/expected-reading-order");

mkdirSync(pdfDir, { recursive: true });
mkdirSync(expectedDir, { recursive: true });

function escapePdf(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(lines) {
  // lines: [{ x, y, size, text }] PDF coordinates, origin bottom-left, letter 612x792
  const ops = ["BT"];
  for (const line of lines) {
    ops.push(`/F1 ${line.size} Tf`);
    ops.push(`1 0 0 1 ${line.x} ${line.y} Tm`);
    ops.push(`(${escapePdf(line.text)}) Tj`);
  }
  ops.push("ET");
  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const fixtures = {
  "single-column": {
    lines: [
      { x: 54, y: 712, size: 18, text: "SINGLECOL Title of the Paper About Widgets" },
      { x: 54, y: 652, size: 13, text: "Introduction" },
      { x: 54, y: 622, size: 10, text: "SINGLECOL_P1 This opening paragraph explains the problem." },
      { x: 54, y: 562, size: 10, text: "SINGLECOL_P2 A second paragraph continues the argument." },
      { x: 54, y: 502, size: 10, text: "SINGLECOL_P3 The method section would normally follow." },
    ],
    expected: {
      name: "single-column",
      tokensInOrder: ["SINGLECOL_P1", "SINGLECOL_P2", "SINGLECOL_P3"],
    },
  },
  "basic-two-column": {
    lines: [
      { x: 54, y: 672, size: 12, text: "Introduction" },
      { x: 54, y: 642, size: 10, text: "LEFTCOL_A Wearable computing began as bulky prototypes." },
      { x: 54, y: 612, size: 10, text: "LEFTCOL_H Final left line about workshop methods." },
      { x: 318, y: 672, size: 12, text: "Related Work" },
      { x: 318, y: 642, size: 10, text: "RIGHTCOL_A Prior systems treated ornament as an afterthought." },
      { x: 318, y: 612, size: 10, text: "RIGHTCOL_H Final right line about exhibition contexts." },
    ],
    expected: {
      name: "basic-two-column",
      tokensInOrder: ["LEFTCOL_A", "LEFTCOL_H", "RIGHTCOL_A", "RIGHTCOL_H"],
      detect: ["left-then-right", "no-line-interleave"],
    },
  },
  "ACM-style-two-column": {
    lines: [
      { x: 54, y: 722, size: 18, text: "ACMSTYLE Interactive Jewelry as Computational Craft" },
      { x: 54, y: 642, size: 12, text: "Abstract" },
      { x: 54, y: 612, size: 10, text: "ACMSTYLE_ABS We present a study of jewelry-like wearables." },
      { x: 54, y: 532, size: 10, text: "ACMSTYLE_L1 The first column of an ACM paper." },
      { x: 318, y: 532, size: 10, text: "ACMSTYLE_R1 Right column starts after the left column." },
    ],
    expected: {
      name: "ACM-style-two-column",
      tokensInOrder: ["ACMSTYLE Interactive", "ACMSTYLE_ABS", "ACMSTYLE_L1", "ACMSTYLE_R1"],
    },
  },
  "full-width-title": {
    lines: [
      { x: 54, y: 722, size: 18, text: "ACMSTYLE Interactive Jewelry as Computational Craft" },
    ],
    expected: { name: "full-width-title", role: "title", spanning: true },
  },
  "full-width-figure": {
    lines: [
      { x: 54, y: 682, size: 10, text: "FWFIG_L1 Text above the full-width figure." },
      { x: 318, y: 682, size: 10, text: "FWFIG_R1 Text above the figure in the right column." },
      { x: 54, y: 412, size: 9, text: "Figure 1. FWFIG_CAPTION A full-width diagram." },
      { x: 54, y: 362, size: 10, text: "FWFIG_L9 Left column resumes after the figure." },
    ],
    expected: {
      name: "full-width-figure",
      captionToken: "FWFIG_CAPTION",
      captionNotMixedIntoBody: true,
    },
  },
  "figure-inside-column": {
    lines: [
      { x: 54, y: 682, size: 10, text: "FIGCOL_L1 Body text before an in-column figure caption." },
      { x: 54, y: 602, size: 9, text: "Figure 2. FIGCOL_CAPTION Prototype ring with a hidden latch." },
      { x: 54, y: 552, size: 10, text: "FIGCOL_L3 Body text after the in-column figure caption." },
      { x: 318, y: 682, size: 10, text: "FIGCOL_R1 Right column must not swallow the left caption." },
    ],
    expected: {
      name: "figure-inside-column",
      captionToken: "FIGCOL_CAPTION",
      captionColumn: "left",
    },
  },
  "complex-first-page": {
    lines: [
      { x: 54, y: 772, size: 8, text: "Proceedings of TEI 2024 Conference on Tangible Embedded" },
      { x: 54, y: 722, size: 18, text: "COMPLEX First-Page Layout With Mixed Bands" },
      { x: 54, y: 92, size: 7, text: "Permission to make digital or hard copies of all or part of this work." },
    ],
    expected: {
      name: "complex-first-page",
      headerMustNotBeBody: "Proceedings of TEI 2024",
      copyrightMustNotBeBody: "Permission to make digital or hard copies",
    },
  },
  footnote: {
    lines: [
      { x: 54, y: 682, size: 10, text: "FOOT_L1 Main left column text above the footnote band." },
      { x: 54, y: 52, size: 8, text: "1 FOOTNOTE_MARK See workshop protocol for recruitment details." },
    ],
    expected: { name: "footnote", token: "FOOTNOTE_MARK", notMergedWith: "FOOT_L1" },
  },
  references: {
    lines: [
      { x: 54, y: 412, size: 12, text: "References" },
      { x: 54, y: 382, size: 9, text: "1. Martin A. Conway, 1990, Autobiographical Memory, REFENTRY_A." },
    ],
    expected: {
      name: "references",
      heading: "References",
      bibMustNotBeHeading: "REFENTRY_A",
    },
  },
};

for (const [name, fixture] of Object.entries(fixtures)) {
  writeFileSync(join(pdfDir, `${name}.pdf`), buildPdf(fixture.lines));
  writeFileSync(
    join(expectedDir, `${name}.json`),
    JSON.stringify(fixture.expected, null, 2) + "\n"
  );
}

console.log(`Wrote ${Object.keys(fixtures).length} generated PDFs to ${pdfDir}`);
