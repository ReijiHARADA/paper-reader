import { useState } from "react";
import { Maximize2, X, Eye, EyeOff } from "lucide-react";
import type { PaperBlock, FigureMetadata } from "../../types/paper";
import styles from "./Figure.module.css";
import { splitCaptionLabel } from "./caption";

type FigureProps = {
  block: PaperBlock;
  metadata: FigureMetadata;
};

export function Figure({ metadata }: FigureProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [showOriginalCaption, setShowOriginalCaption] = useState(false);

  const hasTranslatedCaption =
    metadata.captionTranslated && metadata.captionOriginal;
  const hasImage = Boolean(metadata.imageUrl);
  const caption = metadata.captionTranslated || metadata.captionOriginal || "";
  const displayedCaption = splitCaptionLabel(caption, metadata.figureNumber || "Figure");

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
            <div className={styles.missingImage}>図を抽出できませんでした</div>
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
          <span className={styles.figureNumber}>{displayedCaption.label}</span>
          {displayedCaption.text && (
            <span className={styles.captionText}>{displayedCaption.text}</span>
          )}

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
            <img
              src={metadata.imageUrl}
              alt={caption}
              className={styles.zoomedImage}
            />
            <p className={styles.zoomedCaption}>
              <strong>{displayedCaption.label}:</strong>{" "}
              {displayedCaption.text}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
