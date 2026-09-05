import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useLibraryCache } from "../../stores/libraryCache";
import { useProjectStore } from "../../stores/projectStore";
import { filterPapersByLibraryQuery } from "../../domain/librarySearch";
import { derivePaperReadiness } from "../../domain/paperReadiness";
import { PaperDeleteControls } from "./PaperDeleteControls";
import { PaperCard } from "./PaperCard";
import { PaperMenu } from "./PaperMenu";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import styles from "./LibraryScreen.module.css";

export function FavoritesScreen() {
  const navigate = useNavigate();
  const papers = useLibraryCache((s) => s.papers);
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const blocks = useLibraryCache((state) => state.blocks);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const favorites = useMemo(
    () => filterPapersByLibraryQuery(papers.filter((p) => p.favorite), searchQuery),
    [papers, searchQuery]
  );
  const { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete } =
    useDeletePaper();

  const handleOpen = (paperId: string) => {
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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Star size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>お気に入り</h1>
        </div>
      </header>
      <main className={styles.main}>
        {favorites.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Star size={64} strokeWidth={1} /></div>
            <h2 className={styles.emptyTitle}>お気に入りがありません</h2>
            <p className={styles.emptyDescription}>カードのメニューからお気に入りに追加できます</p>
          </div>
        ) : (
          <div className={styles.paperList}>
            {favorites.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                enabled={pendingId !== paper.id}
                onOpen={() => handleOpen(paper.id)}
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
