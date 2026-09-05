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
      <h2 className={styles.sectionTitle}>データ</h2>
      <div className={styles.surface}>
        <h3 className={styles.surfaceTitle}>翻訳キャッシュ</h3>
        <p className={styles.sectionDescription}>
          同じ文章を速く翻訳するための一時データです。
        </p>
        <p className={styles.cacheNote}>削除しても、保存済みの論文・翻訳・元PDF・メモは消えません。</p>
        <p className={styles.cacheNote}>翻訳結果をリセットしたいときに削除してください。</p>
        {confirming ? (
          <div className={styles.confirmRow}>
            <p className={styles.confirmText}>翻訳キャッシュを削除しますか？ 保存済みの論文や翻訳、元PDF、メモは削除されません。</p>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busy}
              onClick={onConfirmClear}
            >
              {busy ? "削除中..." : "キャッシュを削除"}
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
