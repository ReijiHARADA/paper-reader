import { useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Plus, Inbox } from "lucide-react";
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
import { useDeletePaper } from "../../hooks/useDeletePaper";
import type { Paper } from "../../types/paper";
import styles from "./LibraryScreen.module.css";

export function InboxScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const papers = useLibraryCache((s) => s.papers);
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const blocks = useLibraryCache((state) => state.blocks);
  const memberships = useProjectStore((s) => s.memberships);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const importJobs = useImportJobStore((state) => state.jobs);
  const jobs = useMemo(
    () => visibleImportJobs(importJobs, { inboxOnly: true }),
    [importJobs]
  );
  const { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete } =
    useDeletePaper();

  const assigned = new Set(memberships.map((m) => m.paperId));
  const inboxPapers = useMemo(
    () => filterPapersByLibraryQuery(papers.filter((p) => !assigned.has(p.id)), searchQuery),
    [assigned, papers, searchQuery]
  );

  const handleFileSelect = useCallback(async (file: File) => {
    await tryStartPdfImport(file);
  }, []);

  const handleOpen = (paper: Paper) => {
    if (pendingId === paper.id) return;
    const view = derivePaperReadiness({
      processingStatus: paper.processingStatus,
      blocks: blocks[paper.id],
    });
    if (!view.canOpen) return;
    setCurrentPaper(paper.id);
    navigate(`/reader/${paper.id}`);
  };

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
          <Inbox size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>Inbox</h1>
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
        {inboxPapers.length === 0 && jobs.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Upload size={64} strokeWidth={1} /></div>
            <h2 className={styles.emptyTitle}>
              {searchQuery.trim() ? "一致する論文がありません" : "Inboxは空です"}
            </h2>
            <p className={styles.emptyDescription}>
              どのプロジェクトにも属さない論文がここに入ります。右上の「論文を追加」か、PDF をこの画面にドロップしてください。メニューからプロジェクトに追加できます。
            </p>
          </div>
        ) : (
          <div className={styles.paperList}>
            {jobs.map((job) => (
              <ImportJobCard key={job.id} job={job} />
            ))}
            {inboxPapers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                enabled={pendingId !== paper.id}
                onOpen={() => handleOpen(paper)}
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
        )}
      </main>
    </div>
  );
}
