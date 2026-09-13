import { Link } from "react-router-dom";
import type { WorkspaceNode } from "../../types/project";
import styles from "./WorkspacePathTrail.module.css";

type WorkspacePathTrailProps = {
  /** Root → … → nearest folder. */
  folders: WorkspaceNode[];
  /**
   * Optional trailing leaf (e.g. paper title). When set, every folder is a link.
   * When omitted, the last folder is the current location (not a link).
   */
  leaf?: { label: string };
  /** Larger title style for folder screens; compact for reader chrome. */
  size?: "md" | "sm";
};

export function WorkspacePathTrail({
  folders,
  leaf,
  size = "md",
}: WorkspacePathTrailProps) {
  if (folders.length === 0 && !leaf) return null;

  const folderIsCurrent = !leaf;
  const segments: Array<{
    key: string;
    label: string;
    to?: string;
    current: boolean;
  }> = folders.map((folder, index) => {
    const isLast = index === folders.length - 1;
    const current = folderIsCurrent && isLast;
    return {
      key: folder.id,
      label: folder.name,
      to: current ? undefined : `/project/${folder.id}`,
      current,
    };
  });

  if (leaf) {
    segments.push({
      key: "leaf",
      label: leaf.label,
      current: true,
    });
  }

  return (
    <nav
      className={`${styles.trail} ${size === "sm" ? styles.sm : styles.md}`}
      aria-label="場所"
    >
      {segments.map((segment, index) => (
        <span key={segment.key} className={styles.segmentWrap}>
          {index > 0 && (
            <span className={styles.sep} aria-hidden="true">
              /
            </span>
          )}
          {segment.current ? (
            <span className={styles.current} title={segment.label}>
              {segment.label}
            </span>
          ) : (
            <Link to={segment.to!} className={styles.ancestor} title={segment.label}>
              {segment.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
