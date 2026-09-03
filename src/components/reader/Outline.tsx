import type { Section } from "../../types/paper";
import { sectionDisplayTitle } from "../../services/translation/quality";
import styles from "./Outline.module.css";

type OutlineProps = {
  sections: Section[];
  activeSection: string | null;
  onSectionClick: (sectionId: string) => void;
};

export function Outline({
  sections,
  activeSection,
  onSectionClick,
}: OutlineProps) {
  const rootSections = sections.filter((s) => s.parentSectionId === null);

  const renderSection = (section: Section) => {
    const children = sections.filter((s) => s.parentSectionId === section.id);
    const isActive = activeSection === section.id;

    return (
      <li key={section.id} className={styles.item}>
        <button
          className={`${styles.link} ${isActive ? styles.active : ""}`}
          style={{ paddingLeft: `${(section.level - 1) * 16 + 12}px` }}
          onClick={() => onSectionClick(section.id)}
        >
          <span className={styles.title}>
            {sectionDisplayTitle(section)}
          </span>
        </button>
        {children.length > 0 && (
          <ul className={styles.sublist}>
            {children.map((child) => renderSection(child))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav className={styles.container}>
      <h2 className={styles.heading}>目次</h2>
      <ul className={styles.list}>
        {rootSections.map((section) => renderSection(section))}
      </ul>
    </nav>
  );
}
