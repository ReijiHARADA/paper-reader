import type { CSSProperties } from "react";
import { DisplaySettingsControls } from "../reader/DisplaySettingsControls";
import { useAppStore, type DisplaySettings } from "../../stores/appStore";
import styles from "./SettingsScreen.module.css";

export function ReadingSettingsSection() {
  const displaySettings = useAppStore((state) => state.displaySettings);
  const setDisplaySettings = useAppStore((state) => state.setDisplaySettings);
  const previewStyle = {
    "--content-font-size": `${displaySettings.fontSize}px`,
    "--content-line-height": displaySettings.lineHeight,
    "--content-max-width": `${displaySettings.contentWidth}px`,
  } as CSSProperties;

  return (
    <>
      <div className={styles.sectionHeading}><h2 className={styles.sectionTitle}>読書</h2></div>
      <div className={styles.surface}>
        <DisplaySettingsControls onReset={() => setDisplaySettings(DEFAULT_READING_SETTINGS)} />
        <div className={styles.originalSetting}>
          <label className={styles.label} htmlFor="original-display">原文の表示</label>
          <p className={styles.sectionDescription}>英語原文を本文内でどのように表示するか選びます。</p>
          <select id="original-display" className={styles.select} value={displaySettings.originalDisplay} onChange={(e) => setDisplaySettings({ originalDisplay: e.target.value as DisplaySettings["originalDisplay"] })}>
            <option value="on-demand">必要なときだけ</option><option value="always">常に表示</option><option value="when-untranslated">翻訳がないときだけ</option>
          </select>
        </div>
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

const DEFAULT_READING_SETTINGS: DisplaySettings = { fontSize: 16, lineHeight: 1.8, contentWidth: 720, theme: "system", originalDisplay: "on-demand" };
