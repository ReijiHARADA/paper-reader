import type { CSSProperties } from "react";
import { DisplaySettingsControls } from "../reader/DisplaySettingsControls";
import { useAppStore, type DisplaySettings, type SidebarMode } from "../../stores/appStore";
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
        <div className={styles.originalSetting}>
          <label className={styles.label} htmlFor="sidebar-mode">左サイドバー</label>
          <p className={styles.sectionDescription}>ホバーで自動開閉するか、常に開いた／閉じた状態にするかを選びます。</p>
          <select
            id="sidebar-mode"
            className={styles.select}
            value={displaySettings.sidebarMode}
            onChange={(e) => setDisplaySettings({ sidebarMode: e.target.value as SidebarMode })}
          >
            <option value="auto">ホバーで自動開閉</option>
            <option value="expanded">常に開く</option>
            <option value="collapsed">常に閉じる（アイコンのみ）</option>
          </select>
        </div>
        <label className={`${styles.toggleRow} ${styles.originalSetting}`} htmlFor="sidebar-roots-only">
          <span>
            <strong>折りたたみ時は最上位だけ表示</strong>
            <small>
              オン（推奨）: アイコンだけのとき、ワークスペースの入れ子フォルダ／論文を隠します。オフ: 以前どおり、開いているフォルダの中身も並べます。
            </small>
          </span>
          <input
            id="sidebar-roots-only"
            type="checkbox"
            checked={displaySettings.sidebarCollapseRootsOnly}
            onChange={(e) => setDisplaySettings({ sidebarCollapseRootsOnly: e.target.checked })}
          />
        </label>
        <div className={styles.readingPreview} style={previewStyle} aria-label="本文プレビュー">
          <p className={styles.readingPreviewTitle}>プレビュー</p>
          <p className={styles.readingPreviewBody}>
            英語論文を、日本語の記事を読む感覚で読むための表示です。文字サイズ・行間・本文幅がここに反映されます。
          </p>
          <p className={styles.readingPreviewOriginal}>
            段落を展開したときに見える原文の表示例です。
          </p>
        </div>
      </div>
    </>
  );
}

const DEFAULT_READING_SETTINGS: DisplaySettings = {
  fontSize: 16,
  lineHeight: 1.8,
  contentWidth: 720,
  theme: "system",
  originalDisplay: "on-demand",
  sidebarMode: "auto",
  sidebarCollapseRootsOnly: true,
};
