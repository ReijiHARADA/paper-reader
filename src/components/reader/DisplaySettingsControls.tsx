import { Sun, Moon, Monitor } from "lucide-react";
import { useAppStore, type Theme } from "../../stores/appStore";
import styles from "./DisplaySettingsControls.module.css";

export function DisplaySettingsControls({ onReset }: { onReset?: () => void }) {
  const displaySettings = useAppStore((state) => state.displaySettings);
  const setDisplaySettings = useAppStore((state) => state.setDisplaySettings);

  const handleThemeChange = (theme: Theme) => {
    setDisplaySettings({ theme });
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  };

  return (
    <div className={styles.content}>
      {onReset && <button type="button" className={styles.resetButton} onClick={onReset}>デフォルトに戻す</button>}
      <div className={styles.setting}>
        <label className={styles.label}>テーマ</label>
        <p className={styles.description}>アプリ全体の明るさを選びます。</p>
        <div className={styles.themeButtons}>
          <button
            type="button"
            className={`${styles.themeButton} ${
              displaySettings.theme === "light" ? styles.active : ""
            }`}
            onClick={() => handleThemeChange("light")}
          >
            <Sun size={16} />
            <span>ライト</span>
          </button>
          <button
            type="button"
            className={`${styles.themeButton} ${
              displaySettings.theme === "dark" ? styles.active : ""
            }`}
            onClick={() => handleThemeChange("dark")}
          >
            <Moon size={16} />
            <span>ダーク</span>
          </button>
          <button
            type="button"
            className={`${styles.themeButton} ${
              displaySettings.theme === "system" ? styles.active : ""
            }`}
            onClick={() => handleThemeChange("system")}
          >
            <Monitor size={16} />
            <span>システム</span>
          </button>
        </div>
        {displaySettings.theme === "system" && <p className={styles.hint}>Macの表示設定に合わせます。</p>}
      </div>

      <div className={styles.setting}>
        <label className={styles.label}>文字サイズ</label>
        <p className={styles.description}>本文の文字を読みやすい大きさに調整します。</p>
        <div className={styles.sliderRow}><span>小さい</span><input aria-label="文字サイズ" type="range" min="12" max="24" step="1" value={displaySettings.fontSize} onChange={(e) => setDisplaySettings({ fontSize: Number(e.target.value) })} /><span>大きい</span></div>
      </div>

      <div className={styles.setting}>
        <label className={styles.label}>行間</label>
        <p className={styles.description}>文章の行と行の間隔を調整します。</p>
        <div className={styles.sliderRow}><span>狭い</span><input aria-label="行間" type="range" min="1.4" max="2.4" step="0.1" value={displaySettings.lineHeight} onChange={(e) => setDisplaySettings({ lineHeight: Number(e.target.value) })} /><span>広い</span></div>
      </div>

      <div className={styles.setting}>
        <label className={styles.label}>本文幅</label>
        <p className={styles.description}>1行の長さを調整します。</p>
        <div className={styles.sliderRow}><span>狭い</span><input aria-label="本文幅" type="range" min="480" max="960" step="10" value={displaySettings.contentWidth} onChange={(e) => setDisplaySettings({ contentWidth: Number(e.target.value) })} /><span>広い</span></div>
      </div>
    </div>
  );
}
