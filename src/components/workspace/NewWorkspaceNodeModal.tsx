import { useState } from "react";
import { X } from "lucide-react";
import styles from "../project/ProjectModal.module.css";

export function NewWorkspaceNodeModal({ parentName, onClose, onCreate }: {
  parentName?: string;
  onClose: () => void;
  onCreate: (input: { name: string; description?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  return <div className={styles.overlay} onClick={onClose} role="presentation"><div className={styles.modal} role="dialog" aria-labelledby="new-workspace-title" onClick={(event) => event.stopPropagation()}>
    <header className={styles.header}><h2 id="new-workspace-title" className={styles.title}>{parentName ? `「${parentName}」にサブフォルダーを追加` : "新規フォルダ"}</h2><button className={styles.closeButton} onClick={onClose} title="閉じる"><X size={18} /></button></header>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (!name.trim()) { setError("名前を入力してください"); return; } setSaving(true); setError(null); void onCreate({ name: name.trim(), description: description.trim() || undefined }).then(onClose).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "作成に失敗しました")).finally(() => setSaving(false)); }}>
      <label className={styles.label}>フォルダ名<input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="例: 関連研究" autoFocus /></label>
      <label className={styles.label}>説明（任意）<textarea className={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="このワークスペースについて" rows={3} /></label>
      {error && <p className={styles.error}>{error}</p>}<div className={styles.actions}><button type="button" className={styles.secondary} onClick={onClose}>キャンセル</button><button type="submit" className={styles.primary} disabled={saving}>{saving ? "保存中..." : "作成"}</button></div>
    </form>
  </div></div>;
}
