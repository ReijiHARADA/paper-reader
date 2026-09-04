import { useNavigate } from "react-router-dom";
import { Star, FileText } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { displayPaperTitle } from "../../services/translation/quality";
import styles from "./LibraryScreen.module.css";

export function FavoritesScreen() {
  const navigate = useNavigate();
  const papers = useAppStore((s) => s.papers);
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);
  const favorites = papers.filter((p) => p.favorite);

  const handleOpen = (paperId: string) => {
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
              <article
                key={paper.id}
                className={styles.paperCard}
                onClick={() => handleOpen(paper.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleOpen(paper.id); }}
              >
                <div className={styles.paperIcon}><FileText size={32} strokeWidth={1.5} /></div>
                <div className={styles.paperInfo}>
                  <h3 className={styles.paperTitle}>{displayPaperTitle(paper)}</h3>
                  {paper.authors.length > 0 && (
                    <p className={styles.paperAuthors}>
                      {paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 && " ほか"}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
