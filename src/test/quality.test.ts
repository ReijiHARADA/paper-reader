import { describe, expect, it } from "vitest";
import {
  isPlausibleJaTranslation,
  isDegenerateTranslation,
  shouldTranslateTitle,
  shouldTranslateParagraph,
  shouldTranslateHeading,
  looksLikeSubjectClassification,
  evaluateJaTranslation,
  extractScientificInvariants,
  isExpectedNonProseParagraph,
  unsafeParagraphStructureReason,
} from "../services/translation/quality";
import { resolveImportConfig } from "../services/import/helpers";
import { analyzeStructure } from "../services/structureService";
import {
  isRetryableTranslationFailure,
  shouldTranslateBlock,
} from "../services/importServiceV2";
import {
  displayProcessingStatus,
  finalizedTranslationStatus,
} from "../services/paperStatus";
import { FIXTURES } from "./readingOrder/builders";
import type { PaperBlock } from "../types/paper";

describe("isPlausibleJaTranslation", () => {
  const source =
    "This research was supported by STW VIDI grant number 016.128.303 Research (NWO), awarded to Elise van den Hoven.";

  it("keeps a Japanese translation that retains grant identifiers from the source", () => {
    expect(
      isPlausibleJaTranslation(
        "本研究は NWO の STW VIDI grant number 016.128.303 によって支援され、Elise van den Hoven に授与された。",
        source
      )
    ).toBe(true);
  });

  it("rejects an English echo of the source", () => {
    expect(isPlausibleJaTranslation(source, source)).toBe(false);
  });

  it("rejects fragmented Japanese decoder artifacts", () => {
    const fragmented =
      "これ は じ る デモン の こと で あ る 。 それ は かおり を 吹 く ため に かおり と な り こと を 吹 き 呼 ん で い る 。";
    const normal =
      "社会的受容性は時間と文化に依存するため、参加者の態度を理解するための自由記述データを収集した。";
    expect(isDegenerateTranslation(fragmented)).toBe(true);
    expect(isPlausibleJaTranslation(fragmented, "We collected open-ended responses to understand participants' attitudes toward the system.")).toBe(false);
    expect(isDegenerateTranslation(normal)).toBe(false);
  });

  it("treats ASCII chi-square notation as an indivisible statistic", () => {
    const source = "There was no difference, χ2(3)=0.37, p=0.83.";
    const output = "差はなかった。p=0.83。";
    expect(evaluateJaTranslation(output, source).reasons.join(" ")).toContain("χ2(3)=0.37");
  });

  it("rejects orphaned invariant-only sentences in a longer prose translation", () => {
    const source =
      "Fairness evaluations. After the main task, participants made fairness judgements for several hypothetical money allocations between a person A and a person B. Neither cathodal, nor anodal tDCS altered the fairness perception of participants (Fig. 8 and Table S3). In line with earlier findings, this suggests that brain stimulation led participants to make different decisions without changing the underlying evaluation process.";
    const output =
      "フェアネス評価。主な作業の後、参加者は仮定的な金銭配分に対して公平性判断を行った。tDCS(Fig. 8 and Table S3)。これは、脳刺激が基礎的な評価過程を変えることなく参加者を異なる決定に導くことを示唆する。";
    expect(evaluateJaTranslation(output, source).reasons).toContain("orphaned source invariant sentence");
  });

  it("allows source facts embedded in Japanese prose", () => {
    const source =
      "The result was consistent with prior observations (Fig. 8 and Table S3), suggesting that the intervention did not change the underlying evaluation process.";
    const output =
      "結果は先行観察（Fig. 8 and Table S3）と一致し、この介入が基礎的な評価過程を変えなかったことを示唆する。";
    expect(evaluateJaTranslation(output, source).reasons).not.toContain("orphaned source invariant sentence");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects a fluent result that loses a bare rank statistic or figure panel", () => {
    const source = "Selfishness changed significantly (Fig. 7b, Mann–Whitney U test, U=307, p=0.03).";
    const dropped = "自己中心性は有意に変化した。p=0.03。";
    const preserved = "自己中心性は有意に変化した（Fig. 7b、Mann–Whitney U test、U=307、p=0.03）。";
    expect(extractScientificInvariants(source).map((item) => item.value)).toEqual(expect.arrayContaining(["Fig. 7b", "U=307", "p=0.03"]));
    expect(isPlausibleJaTranslation(dropped, source)).toBe(false);
    expect(isPlausibleJaTranslation(preserved, source)).toBe(true);
  });

  it("treats plural figure references as source facts", () => {
    const source = "Figures 3, 4, and 5 show the response curves.";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("Figures 3");
    expect(isPlausibleJaTranslation("応答曲線を示す。", source)).toBe(false);
  });

  it("treats parenthesized figure panels as source facts", () => {
    const source = "The necklace case is hung around the neck, as illustrated in Figure 1(a).";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("Figure 1(a)");
    expect(isPlausibleJaTranslation("ネックレスケースを首に掛ける。Figure 1。", source)).toBe(false);
    expect(isPlausibleJaTranslation("ネックレスケースを首に掛ける。Figure 1(a)。", source)).toBe(true);
  });

  it("treats variable comparison conditions as source facts", () => {
    const source = "The OLS comparison assumes y \u0338= 0 when x = 0.";
    const values = extractScientificInvariants(source).map((item) => item.value);
    expect(values).toEqual(expect.arrayContaining(["y \u0338= 0", "x = 0"]));
    expect(isPlausibleJaTranslation("OLS比較を仮定した。x = 0。", source)).toBe(false);
    expect(isPlausibleJaTranslation("OLS比較ではy != 0かつx = 0を仮定した。", source)).toBe(true);
  });

  it("rejects fluent Japanese that drops scientific facts", () => {
    const source = "For n = 20, F(4,33) = 2.913 and p < 0.001 [12] were observed at 9.6 mm.";
    const output = "20人の参加者では有意な差が観察されました。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.invariantScore).toBeLessThan(0.5);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("accepts academic Japanese while preserving scientific invariants", () => {
    const source = "For n = 20, F(4,33) = 2.913 and p < 0.001 [12] were observed at 9.6 mm.";
    const output = "n = 20では、9.6 mmにおいてF(4,33) = 2.913、p < 0.001という結果が観察された[12]。";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("F(4,33) = 2.913");
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects a fluent translation that invents a measurement absent from the source", () => {
    const source = "A moving-average filter with a window length of 60 seconds removes outliers.";
    const output = "60秒の移動平均フィルタで外れ値を除去した。さらに100mmと10mmの測定を行った。";
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("unexpected scientific invariants: 100mm, 10mm");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects an invented calendar year while retaining a source year", () => {
    const source = "Before World War I, wristwatches were worn by women. The Walkman debuted in 1979.";
    const output = "1914年に時計の歴史が発表された。ウォークマンは1979年に発売された。";
    expect(extractScientificInvariants(source).map((item) => item.value)).toContain("1979");
    expect(evaluateJaTranslation(output, source).reasons.join(" ")).toContain("1914");
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects a translation that drops a micro-watt power measurement", () => {
    expect(isPlausibleJaTranslation(
      "装置は11.3 mm幅で335 mgである。",
      "The device is 11.3 mm wide, weighs 335 mg, and consumes 14.4 uW."
    )).toBe(false);
  });

  it("rejects fluent phrase-loop output without relying on a vocabulary blacklist", () => {
    const source = "Wearable devices can support personal and social practices when their design starts from existing rituals.";
    const output = "ウェブアプリケーションの役割を明らかにするため、ウェブアプリケーションの役割を明らかにするため、ウェブアプリケーションの役割を明らかにするための研究を行った。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects repeated short Japanese propositions", () => {
    const source = "The course ends with group participation in a real experiment.";
    const output = "実験の結果、参加者は課題を完了した。実験の結果は、実験の結果と一致し、実験の結果を評価した。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("does not reject normal repeated terms in statistical result prose", () => {
    const source = "Interaction with the Jogwheel located at the collarbone (0.022), the wrist (0.046), the torso (0.012), and the waist (0.027) looked less embarrassing when performed by a male. Interaction occurring at the waist looked less impolite (0.013) and less weird (0.007) when executed by a male. Interaction taking place on the pocket also appeared to bother participants less when performed by a male (0.017).";
    const output = "男性の場合, 鎖骨, 手首, 胴体, 腰部に位置するジョグホイールとの相互作用は, 恥ずかしさが少なく見えた。(0.022)(0.046)(0.012)(0.027)。腰部での相互作用は, 男性が行うときは, 失礼さが少なく(0.013), 奇妙さが少なく(0.007)と見えた。また, ポケット上での相互作用は, 男性(0.017)が行うと, 参加者を不快にさせないように見えた。";
    expect(isDegenerateTranslation(output)).toBe(false);
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects literal tokenizer byte escapes inside otherwise Japanese output", () => {
    const source = "A camera captures an image from beneath the chin.";
    const output = "カメラは<0xE9><0xA0><0x9A>の下から画像を取得する。";
    expect(isDegenerateTranslation(output)).toBe(true);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects leftover scientific placeholders even with Latin lookalike glyphs", () => {
    const source = "The value is x = 0.";
    const output = "値はZZCΙT1ZZである。";
    expect(isDegenerateTranslation(output)).toBe(true);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects leftover scientific placeholders with Greek zeta lookalikes", () => {
    const source = "The values were (0.013) and (0.007).";
    const output = "値は(0.013)で、クールではない(ΖZCIt2ZZ)となった。";
    expect(isDegenerateTranslation(output)).toBe(true);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
  });

  it("rejects a translation that alters a mixed-case technical identifier", () => {
    const source = "Regularized DeepIV improves instrumental variable estimation.";
    const output = "正規化DipIVは操作変数推定を改善する。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).reasons).toContain("scientific invariants missing: DeepIV");
  });

  it("does not treat one model name as preservation of another acronym", () => {
    expect(isPlausibleJaTranslation(
      "DeBERTaはエンコーダ専用モデルである。",
      "BERT and DeBERTa are encoder-only models."
    )).toBe(false);
  });

  it("rejects a fluent translation that silently drops a method acronym", () => {
    const source = "RDIV improves MSE for NPIV regression.";
    const output = "この方法は回帰の誤差を改善する。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).invariantScore).toBeLessThan(0.5);
  });

  it("rejects a translation that drops a hyphenated system identifier", () => {
    expect(
      isPlausibleJaTranslation(
        "人体を用いて複数の装着デバイスへ電力を届ける手法を開発した。",
        "We developed Power-over-Skin, an approach using the human body itself to deliver power."
      )
    ).toBe(false);
  });

  it("rejects a translation that drops an explicit source negation", () => {
    const source = "The individual does not consider x to be important.";
    const output = "個人はxを重要と考える。";
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    const quality = evaluateJaTranslation(output, source);
    expect(quality.reasons).toContain("source negation missing");
    expect(quality.score).toBeLessThan(0.8);
  });

  it("accepts an explicit negation preserved in Japanese", () => {
    const source = "The individual does not consider x to be important.";
    const output = "個人はxを重要とは考えない。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });

  it("rejects an implausibly short translation of a long multi-sentence source", () => {
    const source = `${"The study reports a separate experimental finding with its interpretation. ".repeat(10)}`;
    const output = "本研究は実験結果を報告した。";
    expect(source.length).toBeGreaterThan(500);
    expect(isPlausibleJaTranslation(output, source)).toBe(false);
    expect(evaluateJaTranslation(output, source).reasons).toContain("long source was implausibly shortened");
  });

  it("keeps a complete long translation above the audit-derived length bound", () => {
    const source = `${"The study reports a separate experimental finding with its interpretation. ".repeat(10)}`;
    const output = "研究は複数の実験結果を報告した。各結果は独立して評価された。参加者の反応を詳細に記録した。分析では条件ごとの差を検討した。結果は仮説を部分的に支持した。追加の検証も実施された。解釈には限界が伴う。将来の研究課題を提示した。結論はデータに基づいている。評価結果は再現性と妥当性の観点から詳細に報告された。方法と分析手順は研究目的に照らして明確に説明された。";
    expect(isPlausibleJaTranslation(output, source)).toBe(true);
  });
});

describe("import translation concurrency", () => {
  it.each([2, 4, 8])("keeps configured queue concurrency %i", (translationConcurrency) => {
    expect(resolveImportConfig({ translationConcurrency }).translationConcurrency).toBe(translationConcurrency);
  });
});

describe("shouldTranslateTitle", () => {
  it("does not send a dotted grant identifier as a paper title", () => {
    expect(shouldTranslateTitle("016.128.303")).toBe(false);
  });
});

describe("subject classification lines", () => {
  const ccs1998 =
    "H.5.m. Information interfaces and presentation (e.g., HCI): Miscellaneous; H.5.2 User interfaces.";

  it("detects ACM CCS 1998 catalog lines including the miscellaneous letter suffix", () => {
    expect(looksLikeSubjectClassification(ccs1998)).toBe(true);
    expect(shouldTranslateParagraph(ccs1998)).toBe(false);
    expect(shouldTranslateHeading("ACM Classification Keywords")).toBe(false);
    expect(shouldTranslateHeading("Author Keywords")).toBe(false);
    expect(shouldTranslateHeading("CCS Concepts")).toBe(false);
    expect(shouldTranslateHeading("Index Terms")).toBe(false);
  });

  it("detects CCS 2012 concept trees", () => {
    expect(
      looksLikeSubjectClassification(
        "• Human-centered computing → Interaction devices"
      )
    ).toBe(true);
  });

  it("still translates body prose that happens to mention a classifier code", () => {
    const prose =
      "However, H.5.2 style interfaces are common in this field of research today and deserve a full translated paragraph.";
    expect(looksLikeSubjectClassification(prose)).toBe(false);
    expect(shouldTranslateParagraph(prose)).toBe(true);
  });

  it("marks classification catalog paragraphs as skipped at structure time", () => {
    const result = analyzeStructure(
      FIXTURES["classification-index"](),
      "paper-classif",
      "/tmp/classif.pdf",
      "hash-classif",
      { pageCount: 1 }
    );
    const catalog = result.blocks.find((b) => /H\.5\.m/.test(b.original || ""));
    expect(catalog?.type).toBe("paragraph");
    expect(catalog?.translationStatus).toBe("skipped");
    const prose = result.blocks.find((b) => /CLASSIFIX_INTRO/.test(b.original || ""));
    expect(prose?.translationStatus).toBe("pending");
    const introHeading = result.blocks.find(
      (b) => b.type === "heading" && /^Introduction$/i.test(b.original || "")
    );
    expect(introHeading?.translationStatus).toBe("skipped");
  });
});

describe("unsafe extracted translation input", () => {
  it("explains structural preservation without flagging normal prose", () => {
    expect(
      unsafeParagraphStructureReason(
        "Participants stayed consistent with their free choices when a rule was"
      )
    ).toContain("末尾");
    expect(
      unsafeParagraphStructureReason(
        "data, and a sun-exposure patch with a screen demonstrate sensing and wireless communication."
      )
    ).toContain("先頭");
    expect(
      unsafeParagraphStructureReason(
        "The paper examines a complete paragraph with enough ordinary content to translate safely."
      )
    ).toBeNull();
  });

  it("keeps broken words and short lower-case continuations out of MADLAD", () => {
    const brokenWord =
      "Importantly, we can have a rate O δn in relatively mild conditions while the previous Theo-";
    const lowerCaseContinuation =
      "function approximation and their method for tuning the regularization parameter. When the learning rate is manually set to";
    expect(unsafeParagraphStructureReason(brokenWord)).toContain("語が途中");
    expect(shouldTranslateParagraph(brokenWord)).toBe(false);
    expect(unsafeParagraphStructureReason(lowerCaseContinuation)).toContain("先頭");
    expect(shouldTranslateParagraph(lowerCaseContinuation)).toBe(false);
    expect(
      shouldTranslateParagraph(
        "e.g. the analysis begins with a valid discourse abbreviation and contains enough ordinary academic prose."
      )
    ).toBe(true);
    expect(
      shouldTranslateParagraph(
        "To evaluate the method, we compare the complete results under the same controlled experimental conditions."
      )
    ).toBe(true);
  });

  it("does not present expected metadata skips as structural uncertainty", () => {
    const email = "researcher@example.edu collaborator@example.edu editor@example.edu";
    expect(isExpectedNonProseParagraph(email)).toBe(true);
    expect(unsafeParagraphStructureReason(email)).not.toBeNull();
  });

  it("keeps mixed permission text and incomplete continuations out of MADLAD", () => {
    expect(
      shouldTranslateParagraph(
        "Ppersonal or classroom use is granted without fee provided that copies are made for this work."
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "With the progress of detecting technologies, it is now appropriate to start looking at the possibilities of"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "The paper examines a complete paragraph with enough ordinary prose to translate safely."
      )
    ).toBe(true);
    expect(
      unsafeParagraphStructureReason(
        "The battery life was tested using the MS621FE coin battery as"
      )
    ).toContain("末尾");
    expect(
      shouldTranslateParagraph(
        "The battery life was tested using the MS621FE coin battery as"
      )
    ).toBe(false);
    expect(
      unsafeParagraphStructureReason(
        'The device was rated as "very'
      )
    ).toContain("引用符");
    expect(
      shouldTranslateParagraph(
        "Accuracy ranged from 40.3% to 78.6%, with an average of 54.4% and standard"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "원호연, Hongik University Industrial Design Department Graduate School"
      )
    ).toBe(false);
    expect(
      unsafeParagraphStructureReason(
        "Body temperature is an important vital sign. We present Thermal"
      )
    ).toContain("末尾");
    expect(
      shouldTranslateParagraph(
        "Body temperature is an important vital sign. We present Thermal"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "Thermal Earring: Low-power Wireless Earring for Longitudinal Earlobe Temperature Sensing • 195:3"
      )
    ).toBe(false);
    expect(
      unsafeParagraphStructureReason(
        "We propose to target a specific solution that achieves the least norm, defined as:"
      )
    ).toContain("末尾");
    expect(
      shouldTranslateParagraph(
        "(b) a family of max-depth CFGs that GPT can learn, see Appendix G"
      )
    ).toBe(false);
  });

  it("keeps a paragraph contaminated by a running arXiv header as original", () => {
    expect(
      shouldTranslateParagraph(
        "Consumer response is complex and arXiv:2404.02175v5 13 Mar 2025 provides no prose boundary here."
      )
    ).toBe(false);
  });

  it("keeps flattened diagram labels out of paragraph translation", () => {
    expect(
      shouldTranslateParagraph(
        "Linda Cab Hospital Toma Test Wason also participated in anti-nuclear demonstrations."
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "The University of California research group reported a complete paragraph with sufficient prose for translation."
      )
    ).toBe(true);
  });

  it("keeps a lower-case comma continuation out of paragraph translation", () => {
    expect(
      shouldTranslateParagraph(
        "data, and a sun-exposure patch with a screen demonstrate sensing and wireless communication."
      )
    ).toBe(false);
  });

  it("keeps prose contaminated by an inline numeric table cell out of translation", () => {
    expect(shouldTranslateParagraph("Mean regret Your goal is to maximize received dol- 2 lars within six rounds.")).toBe(false);
    expect(shouldTranslateParagraph("GPT-3, just like people, chose the second option in this controlled experiment.")).toBe(true);
  });

  it("keeps a scientific magnitude with a missing exponent out of translation", () => {
    expect(shouldTranslateParagraph("There are at least 4 × 10 distinct sentential forms derivable from a symbol in this grammar.")).toBe(false);
    expect(shouldTranslateParagraph("There are at least 4 × 10^6 distinct sentential forms derivable from a symbol in this grammar.")).toBe(true);
  });

  it("requires an inline superscript-style citation to survive", () => {
    const source = "We introduced the “cab problem”16 (Cab, see SI Appendix) to participants in a controlled study.";
    expect(isPlausibleJaTranslation("参加者に「タクシー問題」(Cab、SI付録を参照)を提示した。", source)).toBe(false);
    expect(isPlausibleJaTranslation("参加者に「タクシー問題」16 (Cab、SI付録を参照)を提示した。", source)).toBe(true);
  });

  it("keeps a block beginning with a lower-case sentence tail out of translation", () => {
    expect(shouldTranslateParagraph("data. This procedure has proved successful in previous offerings of this course, and the following complete sentences should be stitched with the preceding page before translation.".repeat(2))).toBe(false);
  });

  it("keeps a block ending in an incomplete determiner phrase out of translation", () => {
    expect(shouldTranslateParagraph("The analysis compares every response carefully before looking at the entire")).toBe(false);
    expect(
      shouldTranslateParagraph(
        "Starting from the design philosophy of user-centered design, this paper analyzes the human factors characteristics"
      )
    ).toBe(false);
    expect(
      shouldTranslateParagraph(
        "Bluetooth chips offer a longer wireless range and compatibility with commercial phones, albeit with"
      )
    ).toBe(false);
    expect(shouldTranslateParagraph("Available power density varies between")).toBe(false);
    expect(shouldTranslateParagraph("Participants stayed consistent with their free choices when a rule was")).toBe(false);
    expect(
      shouldTranslateParagraph(
        "This prototype included two applications, the phonebook application, as previously studied in the"
      )
    ).toBe(false);
    expect(shouldTranslateParagraph("A complete-looking extraction sentence that is actually cut at the page boundary ".repeat(8))).toBe(false);
    expect(shouldTranslateParagraph(`“${"A complete quoted interview statement without a final period ".repeat(8)}”`)).toBe(true);
    expect(
      shouldTranslateParagraph(
        "• identity: expressing identity, social status and beliefs towards the world and reconfirming them towards oneself"
      )
    ).toBe(true);
  });

  it("keeps a long lower-case column continuation out of translation", () => {
    expect(shouldTranslateParagraph("substantially improves the ground coupling and unrealistically increases measured performance in the following experimental apparatus description.".repeat(2))).toBe(false);
    expect(shouldTranslateParagraph("e.g. the following paragraph begins with a valid discourse abbreviation and contains enough ordinary academic prose to translate safely.")).toBe(true);
  });

  it("keeps author bylines with editorial acceptance dates out of paragraph translation", () => {
    expect(
      shouldTranslateParagraph(
        "Jörg Gross, Franziska Emmerling & Alexander Sack Accepted: 27 December 2017"
      )
    ).toBe(false);
  });

  it("keeps unnumbered author-year bibliography entries as original text", () => {
    expect(
      shouldTranslateParagraph(
        "WALLACE, J., DEARDEN, Andy and FISHER, T. (2007). The significant other: the value of jewellery within the conception, design and experience of body focussed digital devices. AI and society, 22 (1), 53-62."
      )
    ).toBe(false);
  });
});

describe("Japanese conference structure", () => {
  it("puts はじめに in the outline and extracts CJK authors", () => {
    const result = analyzeStructure(
      FIXTURES["japanese-conference"](),
      "paper-ja",
      "/tmp/ja.pdf",
      "hash-ja",
      { pageCount: 1 }
    );
    expect(result.paper.titleOriginal).toMatch(/情報採餌理論/);
    expect(result.paper.authors.some((name) => /栗原/.test(name))).toBe(true);
    expect(
      result.sections.some((s) => /1 はじめに/.test(s.originalTitle))
    ).toBe(true);
    expect(
      result.sections.some((s) => /Acquisition process/.test(s.originalTitle))
    ).toBe(false);
    expect(result.blocks.some((b) => b.type === "figure")).toBe(true);
  });
});

describe("isRetryableTranslationFailure", () => {
  const prose =
    "This opening paragraph explains the problem in a single column layout with enough words to look like body text.";

  function makeBlock(overrides: Partial<PaperBlock>): PaperBlock {
    return {
      id: "b1",
      paperId: "p1",
      sectionId: "s1",
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: prose,
      translated: null,
      extractionConfidence: 1,
      translationStatus: "failed",
      parentBlockId: null,
      metadata: {},
      ...overrides,
    };
  }

  it("counts a failed body paragraph that the reader can retry", () => {
    const block = makeBlock({});
    expect(shouldTranslateBlock(block)).toBe(true);
    expect(isRetryableTranslationFailure(block)).toBe(true);
  });

  it("does not count failed heading blocks that the reader never renders", () => {
    const block = makeBlock({
      type: "heading",
      original: "Introduction",
    });
    expect(shouldTranslateBlock(block)).toBe(false);
    expect(isRetryableTranslationFailure(block)).toBe(false);
  });

  it("does not count failed figure captions that the reader shows as original", () => {
    const block = makeBlock({
      type: "figure",
      original: "Figure 1. A wearable prototype on a table.",
    });
    expect(isRetryableTranslationFailure(block)).toBe(false);
    expect(
      finalizedTranslationStatus([block], isRetryableTranslationFailure)
    ).toBe("ready");
    expect(
      displayProcessingStatus("partial", [block], isRetryableTranslationFailure)
    ).toBe("ready");
  });

  it("keeps stored partial until blocks are loaded", () => {
    expect(
      displayProcessingStatus("partial", undefined, isRetryableTranslationFailure)
    ).toBe("partial");
  });

  it("does not treat Array.some's index as a section-id set", () => {
    const block = makeBlock({});
    expect(
      finalizedTranslationStatus([block], isRetryableTranslationFailure)
    ).toBe("partial");
    expect(
      displayProcessingStatus("partial", [block], isRetryableTranslationFailure)
    ).toBe("partial");
  });
});
