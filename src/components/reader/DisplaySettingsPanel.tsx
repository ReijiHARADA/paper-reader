import { X } from "lucide-react";
import { DisplaySettingsControls } from "./DisplaySettingsControls";
import styles from "./DisplaySettingsPanel.module.css";

type DisplaySettingsPanelProps = {
  onClose: () => void;
};

export function DisplaySettingsPanel({ onClose }: DisplaySettingsPanelProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>表示設定</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className={styles.body}>
          <DisplaySettingsControls />
        </div>
      </div>
    </div>
  );
}
