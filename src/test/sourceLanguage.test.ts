import { describe, expect, it } from "vitest";
import { isJapaneseSourcePaper, japaneseScriptRatio } from "../services/sourceLanguage";

describe("isJapaneseSourcePaper", () => {
  it("detects a Japanese body even if the title mixes English", () => {
    expect(
      isJapaneseSourcePaper({
        title: "HCI 研究における装着型インタフェースの検討",
        paragraphs: [
          "本研究では、身につけて使うインタフェースの設計指針を整理し、装着時の負担と日常利用の両立について論じる。実験では被験者12名に試作機を装着してもらい、主観評価と行動観察を行った。",
          "関連研究では、ウェアラブルデバイスの社会受容や、装飾性と機能性のトレードオフが繰り返し指摘されている。本稿ではその議論を踏まえ、ジュエリー型デバイスの要件を再構成する。",
          "方法として、試作、装着実験、半構造化インタビューを組み合わせた。得られた発話はテーマごとに分類し、設計含意を抽出した。",
          "結果として、見た目の上品さと操作の分かりやすさが同時に求められ、隠れた入力よりも短い確認動作の方が受け入れられやすいことが分かった。",
        ],
      })
    ).toBe(true);
  });

  it("does not treat English ACM-style prose as Japanese", () => {
    expect(
      isJapaneseSourcePaper({
        title: "Interactive Jewellery: Designing Digital Jewellery for Autobiographical Memory",
        paragraphs: [
          "This paper investigates how interactive jewellery can support autobiographical memory in everyday life through a research-through-design process.",
          "We describe a series of prototypes, field studies, and interviews that informed a design space for digital jewellery and personal remembering.",
          "The findings show that wearability, social appropriateness, and subtle interaction are as important as technical capability when jewellery becomes computational.",
          "We conclude with implications for designers working at the intersection of fashion, memory, and wearable computing.",
        ],
      })
    ).toBe(false);
  });

  it("counts CJK characters in the script ratio", () => {
    expect(japaneseScriptRatio("研究")).toBe(1);
    expect(japaneseScriptRatio("ABC研究")).toBeCloseTo(0.4, 5);
  });
});
