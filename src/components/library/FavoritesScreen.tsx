import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { PaperDeleteControls } from "./PaperDeleteControls";
import { PaperCard } from "./PaperCard";
import { useDeletePaper } from "../../hooks/useDeletePaper";
import styles from "./LibraryScreen.module.css";

export function FavoritesScreen() {
  const navigate = useNavigate();
  const papers = useAppStore((s) => s.papers);
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const favorites = papers.filter((p) => p.favorite);
  const { pendingId, error, busy, requestDelete, cancelDelete, confirmDelete } =
    useDeletePaper();

  const handleOpen = (paperId: string) => {
    if (pendingId === paperId) return;
    setCurrentPaper(paperId);
    navigate(`/reader/${paperId}`);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Star size={20} style={{ color: "var(--color-accent)" }} />
          <h1 className={styles.title}>Favorites</h1>
        </div>
      </header>
      <main className={styles.main}>
        {favorites.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Star size={64} strokeWidth={1} /></div>
            <h2 className={styles.emptyTitle}>お気に入りがありません</h2>
            <p className={styles.emptyDescription}>リーダー画面でスターをつけた論文がここに表示されます</p>
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
