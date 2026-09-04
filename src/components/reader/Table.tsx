import { useState } from "react";
import { Maximize2, X, Eye, EyeOff } from "lucide-react";
import type { PaperBlock, TableMetadata } from "../../types/paper";
import styles from "./Figure.module.css";

type TableProps = {
  block: PaperBlock;
  metadata: TableMetadata;
};

export function Table({ metadata }: TableProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [showOriginalCaption, setShowOriginalCaption] = useState(false);

  const hasTranslatedCaption =
    metadata.captionTranslated && metadata.captionOriginal;
  const hasImage = Boolean(metadata.imageUrl);
  const caption = metadata.captionTranslated || metadata.captionOriginal;

  return (
    <>
      <figure className={styles.figure}>
        <div className={styles.imageWrapper}>
          {hasImage ? (
            <img
              src={metadata.imageUrl}
              alt={caption}
              className={styles.image}
              loading="lazy"
            />
          ) : (
            <div className={styles.missingImage}>表を抽出できませんでした</div>
          )}
          {hasImage && (
            <button
              className={styles.zoomButton}
              onClick={() => setIsZoomed(true)}
              title="拡大表示"
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
        <figcaption className={styles.caption}>
          <span className={styles.figureNumber}>{metadata.tableNumber}</span>
          <span className={styles.captionText}>{caption}</span>
          {hasTranslatedCaption && (
            <button
              className={styles.toggleOriginal}
              onClick={() => setShowOriginalCaption(!showOriginalCaption)}
              title={
                showOriginalCaption ? "原文キャプションを隠す" : "原文キャプションを表示"
              }
            >
              {showOriginalCaption ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          )}
          {showOriginalCaption && metadata.captionOriginal && (
            <p className={styles.originalCaption}>{metadata.captionOriginal}</p>
          )}
        </figcaption>
      </figure>

      {isZoomed && hasImage && (
        <div className={styles.overlay} onClick={() => setIsZoomed(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.closeButton}
              onClick={() => setIsZoomed(false)}
              title="閉じる"
            >
              <X size={24} />
            </button>
            <img src={metadata.imageUrl} alt={caption} className={styles.zoomedImage} />
            <p className={styles.zoomedCaption}>
              <strong>{metadata.tableNumber}:</strong> {caption}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
