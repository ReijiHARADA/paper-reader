import { DisplaySettingsControls } from "../reader/DisplaySettingsControls";
import styles from "./SettingsScreen.module.css";

export function ReadingSettingsSection() {
  return (
    <>
      <h2 className={styles.sectionTitle}>読書</h2>
      <div className={styles.surface}>
        <p className={styles.sectionDescription}>
          リーダーの表示設定と同じ値です。こちらで変えても、論文を読んでいるときの表示に反映されます。
        </p>
        <DisplaySettingsControls />
      </div>
    </>
  );
}
