import { useNavigate } from "react-router-dom";
import { Clock, FileText } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { displayPaperTitle } from "../../services/translation/quality";
import styles from "./LibraryScreen.module.css";

export function RecentScreen() {
  const navigate = useNavigate();
  const papers = useAppStore((s) => s.papers);
  const setCurrentPaper = useAppStore((s) => s.setCurrentPaper);

  // Papers sorted by lastOpenedAt or updatedAt descending
  const recent = [...papers]
    .filter((p) => p.lastOpenedAt || p.lastReadBlockId)
    .sort((a, b) => {
      const ta = a.lastOpenedAt ?? a.updatedAt;
      const tb = b.lastOpenedAt ?? b.updatedAt;
      return tb.localeCompare(ta);
    })
    .slice(0, 30);

  const handleOpen = (paperId: string) => {
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
                  <p className={styles.paperDate}>
                    最終閲覧: {new Date(paper.lastOpenedAt ?? paper.updatedAt).toLocaleDateString("ja-JP")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
