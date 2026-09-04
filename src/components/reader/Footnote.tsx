import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { PaperBlock } from "../../types/paper";
import { usableTranslatedText } from "../../services/translation/quality";
import styles from "./Footnote.module.css";

type FootnoteProps = {
  block: PaperBlock;
};

export function Footnote({ block }: FootnoteProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const translated = usableTranslatedText(block.translated, block.original);
  const display = translated || block.original || "";
  const hasOriginal = Boolean(translated && block.original);

  return (
    <aside className={styles.footnote}>
      <p className={styles.text}>{display}</p>
      {hasOriginal && (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setShowOriginal((v) => !v)}
          title={showOriginal ? "原文を隠す" : "原文を表示"}
        >
          {showOriginal ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}
      {showOriginal && block.original && (
        <p className={styles.original}>{block.original}</p>
      )}
    </aside>
  );
}
