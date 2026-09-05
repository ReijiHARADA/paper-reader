import { ArrowRight } from "lucide-react";
import type { Paper } from "../../types/paper";
import { useLibraryCache } from "../../stores/libraryCache";
import {
  continueReadingPapers,
  formatReadingProgress,
  formatRelativeOpenedAt,
  readingProgressPercent,
} from "../../domain/readingProgress";
import { displayPaperTitle } from "../../services/translation/quality";
import styles from "./LibraryScreen.module.css";

type ContinueReadingProps = {
  papers: Paper[];
  onOpen: (paperId: string) => void;
};

export function ContinueReading({ papers, onOpen }: ContinueReadingProps) {
  const blocks = useLibraryCache((state) => state.blocks);
  const recent = continueReadingPapers(papers, 3);
  if (recent.length === 0) return null;

  return (
    <section className={styles.continueSection} aria-label="続きを読む">
      <h2 className={styles.continueTitle}>続きを読む</h2>
      <div className={styles.continueList}>
        {recent.map((paper) => {
          const percent = readingProgressPercent(paper.lastReadBlockId, blocks[paper.id]);
          const progress = formatReadingProgress(percent);
          const when = formatRelativeOpenedAt(paper.lastOpenedAt ?? paper.updatedAt);
          return (
            <button
              key={paper.id}
              type="button"
              className={styles.continueCard}
              onClick={() => onOpen(paper.id)}
            >
              <div className={styles.continueCopy}>
                <p className={styles.continueName}>{displayPaperTitle(paper)}</p>
                <p className={styles.continueMeta}>
                  {[progress, when].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className={styles.continueAction}>
                続きを読む
                <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
