import { X, Sun, Moon, Monitor, Minus, Plus } from "lucide-react";
import { useAppStore, type Theme } from "../../stores/appStore";
import styles from "./DisplaySettingsPanel.module.css";

type DisplaySettingsPanelProps = {
  onClose: () => void;
};

export function DisplaySettingsPanel({ onClose }: DisplaySettingsPanelProps) {
  const { displaySettings, setDisplaySettings } = useAppStore();

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(12, Math.min(24, displaySettings.fontSize + delta));
    setDisplaySettings({ fontSize: newSize });
  };

  const handleLineHeightChange = (delta: number) => {
    const newHeight = Math.max(
      1.4,
      Math.min(2.4, displaySettings.lineHeight + delta)
    );
    setDisplaySettings({ lineHeight: Math.round(newHeight * 10) / 10 });
  };

  const handleContentWidthChange = (delta: number) => {
    const newWidth = Math.max(
      480,
      Math.min(960, displaySettings.contentWidth + delta)
    );
    setDisplaySettings({ contentWidth: newWidth });
  };

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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>表示設定</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          {/* Font Size */}
          <div className={styles.setting}>
            <label className={styles.label}>文字サイズ</label>
            <div className={styles.control}>
              <button
                className={styles.stepButton}
                onClick={() => handleFontSizeChange(-1)}
                disabled={displaySettings.fontSize <= 12}
              >
                <Minus size={16} />
              </button>
              <span className={styles.value}>{displaySettings.fontSize}px</span>
              <button
                className={styles.stepButton}
                onClick={() => handleFontSizeChange(1)}
                disabled={displaySettings.fontSize >= 24}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Line Height */}
          <div className={styles.setting}>
            <label className={styles.label}>行間</label>
            <div className={styles.control}>
              <button
                className={styles.stepButton}
                onClick={() => handleLineHeightChange(-0.1)}
                disabled={displaySettings.lineHeight <= 1.4}
              >
                <Minus size={16} />
              </button>
              <span className={styles.value}>
                {displaySettings.lineHeight.toFixed(1)}
              </span>
              <button
                className={styles.stepButton}
                onClick={() => handleLineHeightChange(0.1)}
                disabled={displaySettings.lineHeight >= 2.4}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Content Width */}
          <div className={styles.setting}>
            <label className={styles.label}>本文幅</label>
            <div className={styles.control}>
              <button
                className={styles.stepButton}
                onClick={() => handleContentWidthChange(-40)}
                disabled={displaySettings.contentWidth <= 480}
              >
                <Minus size={16} />
              </button>
              <span className={styles.value}>
                {displaySettings.contentWidth}px
              </span>
              <button
                className={styles.stepButton}
                onClick={() => handleContentWidthChange(40)}
                disabled={displaySettings.contentWidth >= 960}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Theme */}
          <div className={styles.setting}>
            <label className={styles.label}>テーマ</label>
            <div className={styles.themeButtons}>
              <button
                className={`${styles.themeButton} ${
                  displaySettings.theme === "light" ? styles.active : ""
                }`}
                onClick={() => handleThemeChange("light")}
              >
                <Sun size={16} />
                <span>ライト</span>
              </button>
              <button
                className={`${styles.themeButton} ${
                  displaySettings.theme === "dark" ? styles.active : ""
                }`}
                onClick={() => handleThemeChange("dark")}
              >
                <Moon size={16} />
                <span>ダーク</span>
              </button>
              <button
                className={`${styles.themeButton} ${
                  displaySettings.theme === "system" ? styles.active : ""
                }`}
                onClick={() => handleThemeChange("system")}
              >
                <Monitor size={16} />
                <span>システム</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
