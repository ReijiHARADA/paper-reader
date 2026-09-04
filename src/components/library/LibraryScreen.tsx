import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  Settings,
  CheckCircle,
  Loader2,
  AlertCircle,
  Clock,
  Upload,
} from "lucide-react";
import { useAppStore, usePaperDataStore } from "../../stores/appStore";
import { samplePaper, sampleSections, sampleBlocks } from "../../data/samplePaper";
import { SettingsModal } from "../settings/SettingsModal";
import { PaperDeleteControls } from "./PaperDeleteControls";
import { DraggablePaperArticle } from "./DraggablePaperArticle";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import type { Paper } from "../../types/paper";
import { processingStatusLabel, isBusyProcessingStatus } from "../../services/paperStatus";
import { checkMADLADAvailability } from "../../services/importServiceV2";
import { setPendingImportFile } from "../../services/pendingImport";
import { displayPaperTitle, usableTranslatedText, isGarbageTitle } from "../../services/translation/quality";
import styles from "./LibraryScreen.module.css";

function getStatusIcon(status: Paper["processingStatus"]) {
  if (isBusyProcessingStatus(status)) {
    return <Loader2 size={16} className={styles.statusProcessing} />;
  }
  switch (status) {
    case "ready":
      return <CheckCircle size={16} className={styles.statusReady} />;
    case "partial":
    case "failed":
      return <AlertCircle size={16} className={styles.statusFailed} />;
    default:
      return <Clock size={16} className={styles.statusPending} />;
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ja-JP", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function LibraryScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { papers, addPaper, setCurrentPaper } = useAppStore();
  const { setSections, setBlocks } = usePaperDataStore();

  const { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete } =
    useDeletePaper();
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // AppShell now handles loading from DB – LibraryScreen just reads from store

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.includes("pdf")) { alert("PDFファイルのみ対応しています"); return; }
    const madladStatus = await checkMADLADAvailability();
    if (!madladStatus.available) {
      alert("翻訳サーバーに接続できません。\ntranslation-server で `python server.py` を実行してください。");
      return;
    }
    setPendingImportFile(file);
    navigate("/import");
  }, [navigate]);

  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!isFileDrag(e)) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelect(files[0]);
  }, [handleFileSelect]);

  const handleLoadSample = () => {
    if (!papers.some((p) => p.id === samplePaper.id)) {
      addPaper(samplePaper);
      setSections(samplePaper.id, sampleSections);
      setBlocks(samplePaper.id, sampleBlocks);
    }
    setCurrentPaper(samplePaper.id);
    navigate(`/reader/${samplePaper.id}`);
  };

  const handleOpenPaper = (paperId: string) => {
    if (pendingId === paperId) return;
    setCurrentPaper(paperId);
    navigate(`/reader/${paperId}`);
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
        className={styles.hiddenInput}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
      />

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <FileText size={24} className={styles.logo} />
          <h1 className={styles.title}>All Papers</h1>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.settingsButton} title="設定" onClick={() => setShowSettings(true)}>
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {isEmpty ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Upload size={64} strokeWidth={1} /></div>
            <h2 className={styles.emptyTitle}>PDFをここにドロップ</h2>
            <p className={styles.emptyDescription}>または下のボタンからPDFを選択してください</p>
            <div className={styles.emptyActions}>
              <button className={styles.primaryButton} onClick={() => fileInputRef.current?.click()}>
                <Plus size={20} />PDFを選択
              </button>
              <button className={styles.secondaryButton} onClick={handleLoadSample}>
                サンプル論文を読む
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <button className={styles.addButton} onClick={() => fileInputRef.current?.click()}>
                <Plus size={20} />PDFを追加
              </button>
              <button className={styles.sampleButton} onClick={handleLoadSample}>
                サンプル論文
              </button>
            </div>

            <div className={styles.paperList}>
              {papers.map((paper) => (
                <DraggablePaperArticle
                  key={paper.id}
                  paperId={paper.id}
                  label={displayPaperTitle(paper)}
                  className={styles.paperCard}
                  enabled={pendingId !== paper.id}
                  onOpen={() => handleOpenPaper(paper.id)}
                >
                  <div className={styles.paperIcon}><FileText size={32} strokeWidth={1.5} /></div>
                  <div className={styles.paperInfo}>
                    <h3 className={styles.paperTitle}>{displayPaperTitle(paper)}</h3>
                    {usableTranslatedText(paper.titleTranslated, paper.titleOriginal) &&
                      paper.titleOriginal && !isGarbageTitle(paper.titleOriginal) && (
                      <p className={styles.paperOriginalTitle}>{paper.titleOriginal}</p>
                    )}
                    {paper.authors.length > 0 && (
                      <p className={styles.paperAuthors}>
                        {paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 && " ほか"}
                      </p>
                    )}
                    <div className={styles.paperMeta}>
                      <span className={styles.paperStatus}>
                        {getStatusIcon(paper.processingStatus)}
                        {processingStatusLabel(paper.processingStatus)}
                      </span>
                      <span className={styles.paperDate}>最終閲覧: {formatDate(paper.updatedAt)}</span>
                    </div>
                  </div>
                  <PaperDeleteControls
                    paperId={paper.id}
                    pendingId={pendingId}
                    error={error}
                    busy={busy}
                    onRequest={requestDelete}
                    onConfirm={confirmDelete}
                    onCancel={cancelDelete}
                  />
                </DraggablePaperArticle>
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
