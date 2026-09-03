import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  Settings,
  Clock,
  CheckCircle,
  Loader2,
  AlertCircle,
  Upload,
  Trash2,
} from "lucide-react";
import { useAppStore, usePaperDataStore } from "../../stores/appStore";
import {
  samplePaper,
  sampleSections,
  sampleBlocks,
} from "../../data/samplePaper";
import {
  getAllPapers,
  getSectionsByPaper,
  getBlocksByPaper,
  deletePaper as deletePaperFromDB,
} from "../../services/database";
import { SettingsModal } from "../settings/SettingsModal";
import type { Paper } from "../../types/paper";
import { checkMADLADAvailability } from "../../services/importServiceV2";
import {
  mergePreferTranslated,
  mergePreferTranslatedSections,
} from "../../utils/mergePaperData";
import { displayPaperTitle, usableTranslatedText, isGarbageTitle } from "../../services/translation/quality";
import styles from "./LibraryScreen.module.css";

function getStatusIcon(status: Paper["processingStatus"]) {
  switch (status) {
    case "ready":
      return <CheckCircle size={16} className={styles.statusReady} />;
    case "translating":
    case "extracting":
    case "structuring":
    case "glossary":
      return <Loader2 size={16} className={styles.statusProcessing} />;
    case "failed":
      return <AlertCircle size={16} className={styles.statusFailed} />;
    default:
      return <Clock size={16} className={styles.statusPending} />;
  }
}

function getStatusText(status: Paper["processingStatus"]) {
  switch (status) {
    case "ready":
      return "翻訳完了";
    case "translating":
      return "翻訳中...";
    case "extracting":
      return "テキスト抽出中...";
    case "structuring":
      return "構造解析中...";
    case "glossary":
      return "用語集生成中...";
    case "partial":
      return "一部完了";
    case "failed":
      return "処理失敗";
    case "queued":
    default:
      return "処理待ち";
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function LibraryScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    papers,
    addPaper,
    removePaper,
    setCurrentPaper,
  } = useAppStore();
  const { setSections, setBlocks } = usePaperDataStore();

  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load papers from database on mount
  useEffect(() => {
    async function loadPapers() {
      try {
        const dbPapers = await getAllPapers();
        for (const paper of dbPapers) {
          addPaper(paper);
          const sections = await getSectionsByPaper(paper.id);
          const blocks = await getBlocksByPaper(paper.id);
          setSections(paper.id, (prev) =>
            mergePreferTranslatedSections(prev, sections)
          );
          setBlocks(paper.id, (prev) => mergePreferTranslated(prev, blocks));
        }
      } catch (e) {
        console.error("Failed to load papers:", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadPapers();
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.type.includes("pdf")) {
        alert("PDFファイルのみ対応しています");
        return;
      }

      // Check if MADLAD server is available
      const madladStatus = await checkMADLADAvailability();
      if (!madladStatus.available) {
        alert(
          "翻訳サーバーに接続できません。\n" +
          "translation-server ディレクトリで `python server.py` を実行してください。"
        );
        return;
      }

      navigate("/import", {
        state: { file },
      });
    },
    [navigate]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFileSelect]
  );

  const handleLoadSample = () => {
    const existingPaper = papers.find((p) => p.id === samplePaper.id);
    if (!existingPaper) {
      addPaper(samplePaper);
      setSections(samplePaper.id, sampleSections);
      setBlocks(samplePaper.id, sampleBlocks);
    }
    setCurrentPaper(samplePaper.id);
    navigate(`/reader/${samplePaper.id}`);
  };

  const handleOpenPaper = (paperId: string) => {
    setCurrentPaper(paperId);
    navigate(`/reader/${paperId}`);
  };

  const handleDeletePaper = async (e: React.MouseEvent, paperId: string) => {
    e.stopPropagation();
    if (!confirm("この論文を削除しますか？翻訳データも削除されます。")) {
      return;
    }
    try {
      await deletePaperFromDB(paperId);
      removePaper(paperId);
    } catch (err) {
      console.error("Failed to delete paper:", err);
    }
  };

  const isEmpty = papers.length === 0;

  return (
    <div
      className={`${styles.container} ${isDragging ? styles.dragging : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileInputChange}
        className={styles.hiddenInput}
      />

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <FileText size={24} className={styles.logo} />
          <h1 className={styles.title}>Paper Reader</h1>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.settingsButton}
            title="設定"
            onClick={() => setShowSettings(true)}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {isLoading ? (
          <div className={styles.loading}>
            <Loader2 size={32} className={styles.loadingIcon} />
            <p>読み込み中...</p>
          </div>
        ) : isEmpty ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Upload size={64} strokeWidth={1} />
            </div>
            <h2 className={styles.emptyTitle}>PDFをここにドロップ</h2>
            <p className={styles.emptyDescription}>
              または下のボタンからPDFを選択してください
            </p>
            <div className={styles.emptyActions}>
              <button
                className={styles.primaryButton}
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={20} />
                PDFを選択
              </button>
              <button
                className={styles.secondaryButton}
                onClick={handleLoadSample}
              >
                サンプル論文を読む
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <button
                className={styles.addButton}
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={20} />
                PDFを追加
              </button>
              <button
                className={styles.sampleButton}
                onClick={handleLoadSample}
              >
                サンプル論文
              </button>
            </div>

            <div className={styles.paperList}>
              {papers.map((paper) => (
                <article
                  key={paper.id}
                  className={styles.paperCard}
                  onClick={() => handleOpenPaper(paper.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleOpenPaper(paper.id);
                    }
                  }}
                >
                  <div className={styles.paperIcon}>
                    <FileText size={32} strokeWidth={1.5} />
                  </div>
                  <div className={styles.paperInfo}>
                    <h3 className={styles.paperTitle}>
                      {displayPaperTitle(paper)}
                    </h3>
                    {usableTranslatedText(paper.titleTranslated, paper.titleOriginal) &&
                      paper.titleOriginal &&
                      !isGarbageTitle(paper.titleOriginal) && (
                      <p className={styles.paperOriginalTitle}>
                        {paper.titleOriginal}
                      </p>
                    )}
                    {paper.authors.length > 0 && (
                      <p className={styles.paperAuthors}>
                        {paper.authors.slice(0, 3).join(", ")}
                        {paper.authors.length > 3 && " ほか"}
                      </p>
                    )}
                    <div className={styles.paperMeta}>
                      <span className={styles.paperStatus}>
                        {getStatusIcon(paper.processingStatus)}
                        {getStatusText(paper.processingStatus)}
                      </span>
                      <span className={styles.paperDate}>
                        最終閲覧: {formatDate(paper.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    className={styles.deleteButton}
                    onClick={(e) => handleDeletePaper(e, paper.id)}
                    title="削除"
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </main>

      {isDragging && (
        <div className={styles.dropOverlay}>
          <Upload size={64} />
          <p>PDFをドロップしてインポート</p>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
