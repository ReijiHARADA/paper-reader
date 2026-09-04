import styles from "./SettingsScreen.module.css";

type StorageSettingsSectionProps = {
  confirming: boolean;
  busy: boolean;
  message: string | null;
  onRequestClear: () => void;
  onConfirmClear: () => void;
  onCancelClear: () => void;
};

export function StorageSettingsSection({
  confirming,
  busy,
  message,
  onRequestClear,
  onConfirmClear,
  onCancelClear,
}: StorageSettingsSectionProps) {
  return (
    <>
      <h2 className={styles.sectionTitle}>ストレージ</h2>
      <div className={styles.surface}>
        <h3 className={styles.surfaceTitle}>翻訳キャッシュ</h3>
        <p className={styles.sectionDescription}>
          再インポート時に使う翻訳キャッシュだけを消します。論文、保存済みの訳文、メモ、用語集、元
          PDF、読書位置は残ります。
        </p>
        {confirming ? (
          <div className={styles.confirmRow}>
            <p className={styles.confirmText}>翻訳キャッシュを削除しますか？</p>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busy}
              onClick={onConfirmClear}
            >
              {busy ? "削除中..." : "削除する"}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={busy}
              onClick={onCancelClear}
            >
              キャンセル
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.sectionButton}
            onClick={onRequestClear}
            disabled={busy}
          >
            翻訳キャッシュを削除
          </button>
        )}
        {message && <p className={styles.sectionStatus}>{message}</p>}
      </div>
    </>
  );
}
