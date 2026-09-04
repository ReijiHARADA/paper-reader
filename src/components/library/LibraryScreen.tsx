import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  Upload,
} from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { PaperDeleteControls } from "./PaperDeleteControls";
import { PaperCard } from "./PaperCard";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import { checkMADLADAvailability } from "../../services/importServiceV2";
import { setPendingImportFile } from "../../services/pendingImport";
import styles from "./LibraryScreen.module.css";

export function LibraryScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { papers, setCurrentPaper } = useAppStore();

  const { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete } =
    useDeletePaper();
  const [isDragging, setIsDragging] = useState(false);

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
            </div>
          </div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <button className={styles.addButton} onClick={() => fileInputRef.current?.click()}>
                <Plus size={20} />PDFを追加
              </button>
            </div>

            <div className={styles.paperList}>
              {papers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  enabled={pendingId !== paper.id}
                  onOpen={() => handleOpenPaper(paper.id)}
                  actions={
                    <PaperDeleteControls
                      paperId={paper.id}
                      pendingId={pendingId}
                      error={error}
                      busy={busy}
                      onRequest={requestDelete}
                      onConfirm={confirmDelete}
                      onCancel={cancelDelete}
                    />
                  }
                />
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
    </div>
  );
}
