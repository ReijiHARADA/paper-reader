import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "../../utils/settingsToc";
import styles from "./SettingsToc.module.css";

type SettingsTocProps = {
  activeId: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
};

export function SettingsToc({ activeId, onSelect }: SettingsTocProps) {
  return (
    <nav className={styles.container} aria-label="設定の目次">
      <h2 className={styles.heading}>目次</h2>
      <ul className={styles.list}>
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id} className={styles.item}>
            <button
              type="button"
              className={`${styles.link} ${activeId === section.id ? styles.active : ""}`}
              onClick={() => onSelect(section.id)}
              aria-current={activeId === section.id ? "true" : undefined}
            >
              <span className={styles.title}>{section.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
