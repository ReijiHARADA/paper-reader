import { useState } from "react";
import type { GlossaryEntry } from "../../services/llm/types";
import styles from "./GlossaryPanel.module.css";

type GlossaryPanelProps = {
  entries: GlossaryEntry[];
  onChange: (entries: GlossaryEntry[]) => void;
  onClose: () => void;
};

export function GlossaryPanel({ entries, onChange, onClose }: GlossaryPanelProps) {
  const [draftTerm, setDraftTerm] = useState("");
  const [draftTranslation, setDraftTranslation] = useState("");

  const updateEntry = (index: number, patch: Partial<GlossaryEntry>) => {
    onChange(
      entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
    );
  };

  const removeEntry = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  const addEntry = () => {
    const term = draftTerm.trim();
    const translation = draftTranslation.trim();
    if (!term || !translation) return;
    onChange([...entries, { term, translation }]);
    setDraftTerm("");
    setDraftTranslation("");
  };

  return (
    <aside className={styles.panel} aria-label="Glossary">
      <header className={styles.header}>
        <h2 className={styles.title}>用語集</h2>
        <button type="button" className={styles.close} onClick={onClose}>
          閉じる
        </button>
      </header>
      <p className={styles.help}>
        採用した訳は翻訳後の置換と再翻訳に使います。用語と訳を直接直せます。
      </p>
      {entries.length === 0 ? (
        <p className={styles.empty}>まだ用語がありません。下から追加できます。</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry, index) => (
            <li key={`${entry.term}-${index}`} className={styles.item}>
              <input
                className={styles.term}
                value={entry.term}
                onChange={(e) => updateEntry(index, { term: e.target.value })}
                aria-label="英語の用語"
              />
              <input
                className={styles.translation}
                value={entry.translation}
                onChange={(e) => updateEntry(index, { translation: e.target.value })}
                aria-label="日本語訳"
              />
              <button type="button" className={styles.remove} onClick={() => removeEntry(index)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.add}>
        <input
          placeholder="English term"
          value={draftTerm}
          onChange={(e) => setDraftTerm(e.target.value)}
        />
        <input
          placeholder="日本語訳"
          value={draftTranslation}
          onChange={(e) => setDraftTranslation(e.target.value)}
        />
        <button type="button" onClick={addEntry}>
          追加
        </button>
      </div>
    </aside>
  );
}
