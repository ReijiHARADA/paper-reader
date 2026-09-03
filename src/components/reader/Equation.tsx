import type { PaperBlock, EquationMetadata } from "../../types/paper";
import styles from "./Equation.module.css";

type EquationProps = {
  block: PaperBlock;
  metadata: EquationMetadata;
};

export function Equation({ block, metadata }: EquationProps) {
  return (
    <div className={styles.container}>
      <div className={styles.equation}>
        {metadata.latex ? (
          <code className={styles.latex}>{metadata.latex}</code>
        ) : metadata.imageUrl ? (
          <img
            src={metadata.imageUrl}
            alt={block.original || "Equation"}
            className={styles.image}
          />
        ) : (
          <code className={styles.fallback}>{block.original}</code>
        )}
      </div>
      {metadata.equationNumber && (
        <span className={styles.number}>{metadata.equationNumber}</span>
      )}
    </div>
  );
}
