import { beforeEach, describe, expect, it } from "vitest";
import {
  useImportJobStore,
  visibleImportJobs,
  type ImportJob,
} from "../../stores/importJobStore";

function job(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job-1",
    fileName: "paper.pdf",
    fileKey: "paper.pdf:1:1",
    stage: "reading",
    stageProgress: 0,
    stageTotal: 1,
    message: "読み込み中...",
    ...overrides,
  };
}

describe("import job card visibility", () => {
  beforeEach(() => useImportJobStore.setState({ jobs: [] }));

  it("shows the temporary card before a paper is materialized", () => {
    expect(visibleImportJobs([job()])).toHaveLength(1);
  });

  it("hides the temporary card once the real paper card exists", () => {
    expect(visibleImportJobs([job({ paperId: "paper-1", stage: "translating" })])).toHaveLength(0);
  });

  it("does not duplicate a materialized paper when later processing fails", () => {
    expect(
      visibleImportJobs([
        job({ paperId: "paper-1", stage: "failed", error: "translation failed" }),
      ])
    ).toHaveLength(0);
  });
});
