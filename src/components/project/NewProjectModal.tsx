import { useState } from "react";
import { X } from "lucide-react";
import styles from "./ProjectModal.module.css";

type NewProjectModalProps = {
  title?: string;
  nameLabel?: string;
  onClose: () => void;
  onCreate: (input: { name: string; description?: string }) => Promise<void>;
};

export function NewProjectModal({
  title = "New Project",
  nameLabel = "研究テーマ",
  onClose,
  onCreate,
}: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-labelledby="new-project-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="new-project-title" className={styles.title}>
            {title}
          </h2>
          <button className={styles.closeButton} onClick={onClose} title="閉じる">
            <X size={18} />
          </button>
        </header>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label}>
            {nameLabel}
            <input
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例: Interactive Jewellery"
              autoFocus
            />
          </label>
          <label className={styles.label}>
            説明（任意）
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="この Project で調べたいこと"
              rows={3}
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving ? "作成中..." : "作成"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
