import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  BookOpen,
} from "lucide-react";
import type { ImportStage } from "../../services/importServiceV2";
import { takePendingImport } from "../../services/pendingImport";
import { startBackgroundImport } from "../../services/import/startBackgroundImport";
import { useImportJobStore } from "../../stores/importJobStore";
import styles from "./ImportScreen.module.css";

const stageLabels: Record<ImportStage, string> = {
  idle: "待機中",
  reading: "ファイル読み込み",
  extracting: "テキスト抽出",
  structuring: "構造解析",
  glossary: "用語集生成",
  translating: "翻訳",
  saving: "保存",
  completed: "完了",
  failed: "エラー",
};

const stageOrder: ImportStage[] = [
  "reading",
  "extracting",
  "structuring",
  "glossary",
  "translating",
  "saving",
];

function getStageIcon(stage: ImportStage, currentStage: ImportStage) {
  const currentIndex = stageOrder.indexOf(currentStage);
  const stageIndex = stageOrder.indexOf(stage);

  if (currentStage === "failed") {
    return <AlertCircle size={16} className={styles.iconError} />;
  }
  if (currentStage === "completed" || stageIndex < currentIndex) {
    return <CheckCircle size={16} className={styles.iconComplete} />;
  }
  if (stageIndex === currentIndex) {
    return <Loader2 size={16} className={styles.iconProcessing} />;
  }
  return <div className={styles.iconPending} />;
}

export function ImportScreen() {
  const navigate = useNavigate();
  const jobs = useImportJobStore((state) => state.jobs);
  const job = jobs[0];

  useEffect(() => {
    const pending = takePendingImport();
    if (pending) {
      void startBackgroundImport(pending.file, {
        projectId: pending.projectId ?? undefined,
      });
      navigate(pending.projectId ? `/project/${pending.projectId}` : "/", { replace: true });
    }
  }, [navigate]);

  const handleBack = () => {
    navigate(job?.projectId ? `/project/${job.projectId}` : "/");
  };

  const handleOpenReader = () => {
    if (job?.paperId) {
      navigate(
        job.projectId
          ? `/reader/${job.paperId}?project=${job.projectId}`
          : `/reader/${job.paperId}`
      );
    }
  };

  const overallProgress =
    job && job.stageTotal > 0
      ? Math.round((job.stageProgress / job.stageTotal) * 100)
      : 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={handleBack}>
          <ArrowLeft size={20} />
          <span>{job?.projectId ? "プロジェクトに戻る" : "ライブラリに戻る"}</span>
        </button>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            {!job || job.stage === "completed" ? (
              <CheckCircle size={48} className={styles.successIcon} />
            ) : job.stage === "failed" ? (
              <AlertCircle size={48} className={styles.errorIcon} />
            ) : (
              <FileText size={48} className={styles.fileIcon} />
            )}
          </div>

          <h1 className={styles.title}>
            {!job || job.stage === "completed"
              ? "インポート完了"
              : job.stage === "failed"
                ? "インポート失敗"
                : "PDFをインポート中"}
          </h1>

          {job && <p className={styles.paperTitle}>{job.fileName}</p>}
          <p className={styles.message}>{job?.message ?? "ライブラリに戻って進行状況を確認できます"}</p>

          {job && job.stage !== "completed" && job.stage !== "failed" && (
            <>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${overallProgress}%` }}
                />
              </div>

              <div className={styles.stages}>
                {stageOrder.map((stage) => (
                  <div
                    key={stage}
                    className={`${styles.stage} ${
                      job.stage === stage ? styles.active : ""
                    }`}
                  >
                    {getStageIcon(stage, job.stage)}
                    <span>{stageLabels[stage]}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={styles.actions}>
            {job?.paperId && (
              <button className={styles.primaryButton} onClick={handleOpenReader}>
                <BookOpen size={20} />
                {job.stage === "completed" ? "論文を読む" : "準備できた部分を読む"}
              </button>
            )}

            <button className={styles.secondaryButton} onClick={handleBack}>
              {job?.projectId ? "プロジェクトに戻る" : "ライブラリに戻る"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
