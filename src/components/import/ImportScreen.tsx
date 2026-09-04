import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  BookOpen,
} from "lucide-react";
import type { ImportProgress, ImportStage } from "../../services/importServiceV2";
import { importPDFV2 } from "../../services/importServiceV2";
import { takePendingImport } from "../../services/pendingImport";
import { useAppStore, usePaperDataStore } from "../../stores/appStore";
import { useProjectStore } from "../../stores/projectStore";
import { getSetting } from "../../services/database";
import type { ImportConfig } from "../../services/importServiceV2";
import { upsertBlock, upsertSection } from "../../utils/mergePaperData";
import { createBlockUpdateBatcher } from "../../utils/batchBlockUpdates";
import {
  addPaperToProject,
  DuplicateProjectPaperError,
} from "../../services/projectService";
import styles from "./ImportScreen.module.css";

const startedImportKeys = new Set<string>();

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
  const location = useLocation();
  const { addPaper, updatePaper } = useAppStore();
  const { setSections, setBlocks } = usePaperDataStore();
  const upsertMembership = useProjectStore((s) => s.upsertMembership);
  const blockBatcherRef = useRef(
    createBlockUpdateBatcher((id, batch) => {
      setBlocks(id, (prev) => batch.reduce((acc, block) => upsertBlock(acc, block), prev));
    })
  );

  const [progress, setProgress] = useState<ImportProgress>({
    stage: "idle",
    stageProgress: 0,
    stageTotal: 1,
    message: "処理を開始しています...",
  });
  const [isPartialReady, setIsPartialReady] = useState(false);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [returnProjectId, setReturnProjectId] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as { file?: File; projectId?: string } | null;
    const pending = takePendingImport();
    const file = pending?.file ?? state?.file;
    const projectId = pending?.projectId ?? state?.projectId ?? null;
    if (!file) {
      navigate("/");
      return;
    }
    setReturnProjectId(projectId);
    const selectedFile = file;
    const importKey = `${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`;
    if (startedImportKeys.has(importKey)) {
      return;
    }
    startedImportKeys.add(importKey);

    let attachedPaperId: string | null = null;
    const attachToProject = async (id: string) => {
      if (!projectId || attachedPaperId === id) return;
      attachedPaperId = id;
      try {
        const link = await addPaperToProject({ projectId, paperId: id });
        upsertMembership(link);
      } catch (error) {
        if (error instanceof DuplicateProjectPaperError) return;
        attachedPaperId = null;
        console.error("Failed to add imported paper to project:", error);
      }
    };

    async function startImport() {
      const settings = await getSetting<ImportConfig>("translationSettingsV2");
      const config: ImportConfig = settings || {};

      importPDFV2(
        selectedFile,
        {
          onProgress: (next) => {
            setProgress(next);
            if (next.stage === "completed" && next.paper) {
              addPaper(next.paper);
              setPaperId(next.paper.id);
              void attachToProject(next.paper.id);
            }
          },
          onStageChange: (stage) => {
            setProgress((prev) => ({ ...prev, stage }));
          },
          onPartialReady: (paper, sections, blocks) => {
            addPaper(paper);
            setSections(paper.id, sections);
            setBlocks(paper.id, blocks);
            setPaperId(paper.id);
            setIsPartialReady(true);
            void attachToProject(paper.id);
          },
          onBlockTranslated: (block) => {
            blockBatcherRef.current.push(block);
          },
          onPaperUpdated: (paper) => {
            updatePaper(paper.id, paper);
          },
          onSectionTranslated: (section) => {
            setSections(section.paperId, (prev) => upsertSection(prev, section));
          },
        },
        config
      ).then((result) => {
        if (result) {
          addPaper(result.paper);
          setSections(result.paper.id, result.sections);
          setBlocks(result.paper.id, result.blocks);
          setPaperId(result.paper.id);
          void attachToProject(result.paper.id);
        } else {
          startedImportKeys.delete(importKey);
        }
      }).catch(() => {
        startedImportKeys.delete(importKey);
      });
    }

    startImport();
  }, [location.state, navigate, addPaper, updatePaper, setSections, setBlocks, upsertMembership]);

  const handleBack = () => {
    navigate(returnProjectId ? `/project/${returnProjectId}` : "/");
  };

  const handleOpenReader = () => {
    if (paperId) {
      navigate(
        returnProjectId
          ? `/reader/${paperId}?project=${returnProjectId}`
          : `/reader/${paperId}`
      );
    }
  };

  const overallProgress =
    progress.stageTotal > 0
      ? Math.round((progress.stageProgress / progress.stageTotal) * 100)
      : 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={handleBack}>
          <ArrowLeft size={20} />
          <span>{returnProjectId ? "プロジェクトに戻る" : "ライブラリに戻る"}</span>
        </button>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            {progress.stage === "completed" ? (
              <CheckCircle size={48} className={styles.successIcon} />
            ) : progress.stage === "failed" ? (
              <AlertCircle size={48} className={styles.errorIcon} />
            ) : (
              <FileText size={48} className={styles.fileIcon} />
            )}
          </div>

          <h1 className={styles.title}>
            {progress.stage === "completed"
              ? "インポート完了"
              : progress.stage === "failed"
              ? "インポート失敗"
              : "PDFをインポート中"}
          </h1>

          {progress.paper?.titleTranslated ? (
            <>
              <p className={styles.paperTitle}>{progress.paper.titleTranslated}</p>
              {progress.paper.titleOriginal && (
                <p className={styles.message}>{progress.paper.titleOriginal}</p>
              )}
            </>
          ) : progress.paper?.titleOriginal ? (
            <p className={styles.paperTitle}>{progress.paper.titleOriginal}</p>
          ) : null}

          <p className={styles.message}>{progress.message}</p>

          {progress.stage !== "completed" && progress.stage !== "failed" && (
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
                      progress.stage === stage ? styles.active : ""
                    }`}
                  >
                    {getStageIcon(stage, progress.stage)}
                    <span>{stageLabels[stage]}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={styles.actions}>
            {(isPartialReady || progress.stage === "completed") && (
              <button
                className={styles.primaryButton}
                onClick={handleOpenReader}
              >
                <BookOpen size={20} />
                {progress.stage === "completed"
                  ? "論文を読む"
                  : "準備できた部分を読む"}
              </button>
            )}

            {progress.stage === "failed" && (
              <button className={styles.secondaryButton} onClick={handleBack}>
                {returnProjectId ? "プロジェクトに戻る" : "ライブラリに戻る"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
