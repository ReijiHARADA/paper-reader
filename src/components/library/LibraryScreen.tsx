import { useCallback, useRef } from "react";
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
import { tryStartPdfImport } from "../../services/pdfImport";
import styles from "./LibraryScreen.module.css";

export function LibraryScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { papers, setCurrentPaper } = useAppStore();

  const { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete } =
    useDeletePaper();

  const handleFileSelect = useCallback(async (file: File) => {
    await tryStartPdfImport(file, navigate);
  }, [navigate]);

  const handleOpenPaper = (paperId: string) => {
    if (pendingId === paperId) return;
    setCurrentPaper(paperId);
    navigate(`/reader/${paperId}`);
  };

  const isEmpty = papers.length === 0;

  return (
    <div className={styles.container}>
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
          <button
            type="button"
            className={styles.addButton}
            onClick={() => fileInputRef.current?.click()}
            title="論文を追加"
          >
            <Plus size={18} />
            論文を追加
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {isEmpty ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Upload size={64} strokeWidth={1} /></div>
            <h2 className={styles.emptyTitle}>PDFをここにドロップ</h2>
            <p className={styles.emptyDescription}>
              または右上の「論文を追加」から PDF を選んでください
            </p>
          </div>
        ) : (
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
        )}
      </main>
    </div>
  );
}
