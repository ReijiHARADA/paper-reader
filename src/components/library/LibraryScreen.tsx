import { useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Plus, Upload } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useImportJobStore, visibleImportJobs } from "../../stores/importJobStore";
import { useProjectStore } from "../../stores/projectStore";
import { filterPapersByLibraryQuery } from "../../domain/librarySearch";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import { tryStartPdfImport } from "../../services/pdfImport";
import { PaperDeleteControls } from "./PaperDeleteControls";
import { PaperCard } from "./PaperCard";
import { PaperMenu } from "./PaperMenu";
import { ImportJobCard } from "./ImportJobCard";
import { ContinueReading } from "./ContinueReading";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import styles from "./LibraryScreen.module.css";

export function LibraryScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const papers = useLibraryCache((state) => state.papers);
  const setCurrentPaper = useAppStore((state) => state.setCurrentPaper);
  const blocks = useLibraryCache((state) => state.blocks);
  const searchQuery = useProjectStore((state) => state.searchQuery);
  const importJobs = useImportJobStore((state) => state.jobs);
  const jobs = useMemo(() => visibleImportJobs(importJobs), [importJobs]);
  const visiblePapers = useMemo(
    () => filterPapersByLibraryQuery(papers, searchQuery),
    [papers, searchQuery]
  );

  const { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete } =
    useDeletePaper();

  const handleFileSelect = useCallback(async (file: File) => {
    await tryStartPdfImport(file);
  }, []);

  const handleOpenPaper = (paperId: string) => {
    if (pendingId === paperId) return;
    const paper = papers.find((item) => item.id === paperId);
    if (!paper) return;
    const view = derivePaperReadiness({
      processingStatus: paper.processingStatus,
      blocks: blocks[paperId],
    });
    if (!view.canOpen) return;
    setCurrentPaper(paperId);
    navigate(`/reader/${paperId}`);
  };

  const isEmpty = visiblePapers.length === 0 && jobs.length === 0;

  return (
    <div className={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className={styles.hiddenInput}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFileSelect(f);
          e.target.value = "";
        }}
      />

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <FileText size={24} className={styles.logo} />
          <h1 className={styles.title}>すべての論文</h1>
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
            <div className={styles.emptyIcon}>
              <Upload size={64} strokeWidth={1} />
            </div>
            <h2 className={styles.emptyTitle}>
              {searchQuery.trim() ? "一致する論文がありません" : "PDFをここにドロップ"}
            </h2>
            <p className={styles.emptyDescription}>
              {searchQuery.trim()
                ? "ライブラリ検索を変えるか、右上から PDF を追加してください"
                : "または右上の「論文を追加」から PDF を選んでください"}
            </p>
          </div>
        ) : (
          <>
            {!searchQuery.trim() && (
              <ContinueReading papers={papers} onOpen={handleOpenPaper} />
            )}
            <div className={styles.paperList}>
              {jobs.map((job) => (
                <ImportJobCard key={job.id} job={job} />
              ))}
              {visiblePapers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  enabled={pendingId !== paper.id}
                  onOpen={() => handleOpenPaper(paper.id)}
                  actions={
                    pendingId === paper.id ? (
                      <PaperDeleteControls
                        paperId={paper.id}
                        pendingId={pendingId}
                        error={error}
                        busy={busy}
                        onRequest={requestDelete}
                        onConfirm={confirmDelete}
                        onCancel={cancelDelete}
                      />
                    ) : (
                      <PaperMenu
                        paper={paper}
                        variant="library"
                        onDeleteRequest={requestDelete}
                      />
                    )
                  }
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
