import type { CSSProperties } from "react";
import { DisplaySettingsControls } from "../reader/DisplaySettingsControls";
import { useAppStore } from "../../stores/appStore";
import styles from "./SettingsScreen.module.css";

export function ReadingSettingsSection() {
  const displaySettings = useAppStore((state) => state.displaySettings);
  const previewStyle = {
    "--content-font-size": `${displaySettings.fontSize}px`,
    "--content-line-height": displaySettings.lineHeight,
    "--content-max-width": `${displaySettings.contentWidth}px`,
  } as CSSProperties;

  return (
    <>
      <h2 className={styles.sectionTitle}>読書</h2>
      <div className={styles.surface}>
        <p className={styles.sectionDescription}>
          リーダーの表示設定と同じ値です。こちらで変えても、論文を読んでいるときの表示に反映されます。
        </p>
        <DisplaySettingsControls />
        <div className={styles.readingPreview} style={previewStyle} aria-label="本文プレビュー">
          <p className={styles.readingPreviewTitle}>プレビュー</p>
          <p className={styles.readingPreviewBody}>
            英語論文を、日本語の記事を読む感覚で読むための表示です。文字サイズ・行間・本文幅がここに反映されます。
          </p>
          <p className={styles.readingPreviewOriginal}>
            This is how the original English looks when you expand a paragraph.
          </p>
        </div>
      </div>
    </>
  );
}
