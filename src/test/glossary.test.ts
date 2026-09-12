import { describe, expect, it } from "vitest";
import { applyGlossary, normalizeSourceGroundedTerminology } from "../services/llm/glossaryService";
import {
  expandCitationKeys,
  indexReferenceBlocks,
  parseCitationGroups,
  uniqueCitationTarget,
} from "../services/citations";
import { classifyPdfOpenError } from "../services/pdfOpenError";
import type { PaperBlock } from "../types/paper";

describe("applyGlossary", () => {
  const glossary = [
    { term: "interactive jewellery", translation: "インタラクティブジュエリー" },
    { term: "embodiment", translation: "身体性" },
  ];

  it("replaces leftover English terms after translation", () => {
    expect(
      applyGlossary("この研究は interactive jewellery を扱う。", glossary)
    ).toContain("インタラクティブジュエリー");
  });

  it("normalizes parenthetical English terms", () => {
    expect(applyGlossary("身体性（embodiment）が重要である。", glossary)).toContain(
      "身体性（embodiment）"
    );
  });

  it("repairs a documented terminology homophone only when its source term is present", () => {
    expect(
      normalizeSourceGroundedTerminology(
        "Vignette-based investigations compare canonical scenarios.",
        "ビニールに基づく調査では、標準的なシナリオを比較する。"
      )
    ).toContain("ヴィネットに基づく");
    expect(
      normalizeSourceGroundedTerminology(
        "The material is vinyl.",
        "ビニール材料を用いた。"
      )
    ).toContain("ビニール材料");
  });

  it("normalizes established cognitive-psychology fallacy terms from source evidence", () => {
    const source = "The conjunction fallacy differs from the base-rate fallacy.";
    expect(
      normalizeSourceGroundedTerminology(source, "連想誤謬と基準値誤謬を比較した。")
    ).toBe("連言錯誤とベースレート錯誤を比較した。");
  });

  it("repairs a source-confirmed multi-armed-bandit homophone", () => {
    expect(
      normalizeSourceGroundedTerminology(
        "The model outperforms humans in a multi-armed bandit task.",
        "モデルは多武装の強盗のタスクで人間を凌駕する。"
      )
    ).toContain("多腕バンディット課題");
  });

  it("does not turn vignette-based tasks into image-only tasks", () => {
    expect(
      normalizeSourceGroundedTerminology(
        "Vignette-based tasks can lead a model astray.",
        "ヴィネット画像のみを用いたタスクはモデルを迷わせる。"
      )
    ).toContain("ヴィネットに基づくタスク");
  });

  it("normalizes an academic related-work section label", () => {
    expect(
      normalizeSourceGroundedTerminology("Related Works. Transformers can encode CFGs.", "関連作品。トランスフォーマはCFGを符号化できる。")
    ).toContain("関連研究");
  });

  it("normalizes source-confirmed cognitive-psychology terminology", () => {
    const source = "The response was human-like and we constructed adversarial vignettes.";
    expect(
      normalizeSourceGroundedTerminology(source, "人間的に記述できる方法で答え、対立ヴィネットを構築した。")
    ).toBe("人間らしいと表現できる方法で答え、敵対的ヴィネットを構築した。");
  });
});

describe("citations", () => {
  it("expands ranges only when the span is small", () => {
    expect(expandCitationKeys("1-3")).toEqual(["1", "2", "3"]);
    expect(expandCitationKeys("1-99")).toEqual([]);
  });

  it("links a unique [n] to the matching reference block", () => {
    const blocks = [
      {
        id: "ref-12",
        type: "reference",
        original: "[12] Cameron S. Miner. 2001. Digital jewelry.",
        metadata: {},
      },
    ] as PaperBlock[];
    const index = indexReferenceBlocks(blocks);
    const groups = parseCitationGroups("see prior work [12] for details.");
    expect(groups[0]?.keys).toEqual(["12"]);
    expect(uniqueCitationTarget(groups[0].keys, index)).toBe("ref-12");
    expect(uniqueCitationTarget(["4"], index)).toBeNull();
  });
});

describe("classifyPdfOpenError", () => {
  it("maps PasswordException to a Japanese password-protected message", () => {
    const error = Object.assign(new Error("No password given"), {
      name: "PasswordException",
    });
    const classified = classifyPdfOpenError(error);
    expect(classified.code).toBe("password_protected");
    expect(classified.message).toMatch(/パスワード/);
  });
});
