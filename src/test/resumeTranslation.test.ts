import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Paper, PaperBlock } from "../types/paper";
import { getBlocksByPaper, saveBlocks, savePaper } from "../services/database";
import { resumeIncompleteTranslation } from "../services/import/resume";
import { resetStorageForTests } from "../data/runtime";

const paper: Paper = {
  id: "retry-failed-paper",
  sourceFilePath: "/tmp/retry.pdf",
  sourceFileHash: "retry-failed-hash",
  titleOriginal: null,
  titleTranslated: null,
  authors: [],
  publication: null,
  year: null,
  pageCount: 1,
  processingStatus: "partial",
  lastReadBlockId: null,
  lastReadOffset: null,
  favorite: false,
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};

const failedBlock: PaperBlock = {
  id: "retry-failed-block",
  paperId: paper.id,
  sectionId: null,
  type: "paragraph",
  order: 0,
  pageStart: 1,
  pageEnd: 1,
  boundingBoxes: [],
  original: "Interactive jewellery connects personal memories with wearable computing through meaningful daily interactions.",
  translated: null,
  extractionConfidence: 1,
  translationStatus: "failed",
  parentBlockId: null,
  metadata: {},
};

describe("resumeIncompleteTranslation", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await resetStorageForTests();
  });

  it("retries a block that failed while the translation server was unavailable", async () => {
    await savePaper(paper);
    await saveBlocks([failedBlock]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            text: "インタラクティブ・ジュエリーは、個人的な記憶とウェアラブル・コンピューティングを、意味のある日常的な相互作用を通じて結び付けます。",
            source_language: "en",
            target_language: "ja",
            model: "madlad400-3b-mt",
            model_version: "3b-mt-v4",
            input_chars: 100,
            output_chars: 60,
            translation_time_ms: 10,
            chars_per_sec: 100,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await resumeIncompleteTranslation(paper.id, {}, { useCache: false });

    const [result] = await getBlocksByPaper(paper.id);
    expect(result.translationStatus).toBe("completed");
    expect(result.translated).toContain("インタラクティブ");
  });
});
