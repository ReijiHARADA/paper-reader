import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { PaperDeleteControls } from "./PaperDeleteControls";
import { PaperCard } from "./PaperCard";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import styles from "./LibraryScreen.module.css";

export function RecentScreen() {
  const navigate = useNavigate();
  const papers = useAppStore((s) => s.papers);
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete } =
    useDeletePaper();

  const recent = [...papers]
    .filter((p) => p.lastOpenedAt || p.lastReadBlockId)
    .sort((a, b) => {
      const ta = a.lastOpenedAt ?? a.updatedAt;
      const tb = b.lastOpenedAt ?? b.updatedAt;
      return tb.localeCompare(ta);
    })
    .slice(0, 30);

  const handleOpen = (paperId: string) => {
    if (pendingId === paperId) return;
    setCurrentPaper(paperId);
    navigate(`/reader/${paperId}`);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Clock size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>Recently Read</h1>
        </div>
      </header>
      <main className={styles.main}>
        {recent.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Clock size={64} strokeWidth={1} /></div>
            <h2 className={styles.emptyTitle}>閲覧履歴がありません</h2>
            <p className={styles.emptyDescription}>論文を開くと、ここに最近読んだ論文が表示されます</p>
          </div>
        ) : (
          <div className={styles.paperList}>
            {recent.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                enabled={pendingId !== paper.id}
                onOpen={() => handleOpen(paper.id)}
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
