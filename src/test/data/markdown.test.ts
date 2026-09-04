import { describe, expect, it } from "vitest";
import { parsePaperMarkdown } from "../../data/markdown/parse";
import { serializePaperMarkdown, stripBlockComments } from "../../data/markdown/serialize";
import { applyCitationLinks } from "../../data/markdown/documentAst";

const front = {
  paperId: "p1",
  language: "en" as const,
  schemaVersion: 1,
};

describe("Paper Reader markdown", () => {
  it("roundtrips block IDs, images, captions, callouts, dividers, equations, and tables", () => {
    const source = `---
paperId: "p1"
language: "en"
schemaVersion: 1
---

# Title

<!-- pr:block id="b-001" -->

## Abstract

<!-- pr:block id="b-002" -->

Hello world.

<!-- pr:block id="b-003" -->

![Figure 1](assets/figure-001.png)

<!-- pr:block id="b-004" -->

*Figure 1. Overview.*

<!-- pr:block id="b-005" -->

$$
E = mc^2
$$

<!-- pr:block id="b-006" -->

---

<!-- pr:block id="b-007" -->

> [!NOTE]
> Keep this.

<!-- pr:block id="b-008" -->

| A | B |
| --- | --- |
| 1 | 2 |

<!-- pr:block id="b-009" -->

<a id="ref-smith-2024"></a>

12. Smith, J. Example.

<!-- pr:block id="b-010" -->
`;
    const parsed = parsePaperMarkdown(source, "p1");
    expect(parsed.nodes.map((node) => [node.type, node.id])).toEqual([
      ["title", "b-001"],
      ["heading", "b-002"],
      ["paragraph", "b-003"],
      ["figure", "b-004"],
      ["caption", "b-005"],
      ["equation", "b-006"],
      ["divider", "b-007"],
      ["callout", "b-008"],
      ["table", "b-009"],
      ["reference", "b-010"],
    ]);
    expect(parsed.nodes.find((node) => node.type === "figure")?.src).toBe("assets/figure-001.png");
    expect(parsed.nodes.find((node) => node.type === "reference")?.referenceId).toBe("ref-smith-2024");

    const again = parsePaperMarkdown(serializePaperMarkdown(parsed.nodes, front));
    expect(again.nodes.map((node) => node.id)).toEqual(parsed.nodes.map((node) => node.id));
  });

  it("keeps original and translation aligned on the same block IDs", () => {
    const original = parsePaperMarkdown(`---
paperId: "p1"
language: "en"
schemaVersion: 1
---

Recent advances.

<!-- pr:block id="b-002" -->
`);
    const translated = parsePaperMarkdown(`---
paperId: "p1"
language: "ja"
schemaVersion: 1
---

近年の進歩。

<!-- pr:block id="b-002" -->
`);
    expect(original.nodes[0].id).toBe("b-002");
    expect(translated.nodes[0].id).toBe("b-002");
    expect(original.nodes[0].text).toContain("Recent");
    expect(translated.nodes[0].text).toContain("近年");
  });

  it("links unique citations and leaves ambiguous ones alone", () => {
    const linked = applyCitationLinks("See [12] and [13].", {
      "ref-smith-2024": {
        id: "ref-smith-2024",
        blockId: "b-9",
        number: "12",
        rawText: "12. Smith",
      },
    });
    expect(linked).toContain("[12](#ref-smith-2024)");
    expect(linked).toContain("[13]");
    expect(linked).not.toContain("[13](#");
  });

  it("can strip internal block comments for export", () => {
    const markdown = serializePaperMarkdown(
      [{ id: "b-1", type: "paragraph", text: "Hello" }],
      front
    );
    expect(markdown).toContain("<!-- pr:block id=\"b-1\" -->");
    expect(stripBlockComments(markdown)).not.toContain("pr:block");
  });
});
