import styles from "./SettingsScreen.module.css";

type GeneralSettingsSectionProps = {
  sampleAlreadyAdded: boolean;
  isAddingSample: boolean;
  sampleMessage: string | null;
  onAddSample: () => void;
};

export function GeneralSettingsSection({
  sampleAlreadyAdded,
  isAddingSample,
  sampleMessage,
  onAddSample,
}: GeneralSettingsSectionProps) {
  return (
    <>
      <h2 className={styles.sectionTitle}>一般</h2>
      <div className={styles.surface}>
        <h3 className={styles.surfaceTitle}>サンプル論文</h3>
        <p className={styles.sectionDescription}>
          翻訳済みの短いサンプルをライブラリに追加して、リーダーの操作を確認できます。
        </p>
        <button
          type="button"
          className={styles.sectionButton}
          onClick={onAddSample}
          disabled={isAddingSample || sampleAlreadyAdded}
        >
          {sampleAlreadyAdded
            ? "追加済み"
            : isAddingSample
              ? "追加中..."
              : "サンプル論文をライブラリに追加"}
        </button>
        {sampleMessage && <p className={styles.sectionStatus}>{sampleMessage}</p>}
      </div>
    </>
  );
}
