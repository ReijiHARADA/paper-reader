import { useEffect, useRef, useCallback } from "react";
import type { Paper, Section, PaperBlock, FigureMetadata, EquationMetadata } from "../../types/paper";
import { Paragraph } from "./Paragraph";
import { Figure } from "./Figure";
import { Equation } from "./Equation";
import { displayPaperTitle, usableTranslatedText, isGarbageTitle, sectionDisplayTitle, looksLikeBibliographyEntry } from "../../services/translation/quality";
import styles from "./PaperContent.module.css";

type PaperContentProps = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  onSectionVisible: (sectionId: string | null) => void;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
};

export function PaperContent({
  paper,
  sections,
  blocks,
  onSectionVisible,
  highlightText,
  onBlockUpdated,
}: PaperContentProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const visibleSections = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => entry.target.id.replace("section-", ""));

      if (visibleSections.length > 0) {
        onSectionVisible(visibleSections[0]);
      }
    },
    [onSectionVisible]
  );

  useEffect(() => {
    observerRef.current = new IntersectionObserver(handleIntersection, {
      rootMargin: "-20% 0px -70% 0px",
      threshold: 0,
    });

    sectionRefs.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [handleIntersection, sections]);

  const registerSectionRef = (sectionId: string, element: HTMLElement | null) => {
    if (element) {
      sectionRefs.current.set(sectionId, element);
      observerRef.current?.observe(element);
    } else {
      const existing = sectionRefs.current.get(sectionId);
      if (existing) {
        observerRef.current?.unobserve(existing);
        sectionRefs.current.delete(sectionId);
      }
    }
  };

  const getBlocksForSection = (sectionId: string | null) => {
    return blocks.filter((block) => block.sectionId === sectionId);
  };

  const renderBlock = (block: PaperBlock) => {
    let content: React.ReactNode = null;

    switch (block.type) {
      case "heading":
        return null;

      case "paragraph":
        content = (
          <Paragraph
            block={block}
            highlightText={highlightText}
            onBlockUpdated={onBlockUpdated}
          />
        );
        break;

      case "figure":
        content = <Figure block={block} metadata={block.metadata as FigureMetadata} />;
        break;

      case "equation":
        content = <Equation block={block} metadata={block.metadata as EquationMetadata} />;
        break;

      case "reference":
        content = (
          <p className={styles.reference}>
            {block.original}
          </p>
        );
        break;

      default:
        return null;
    }

    return (
      <div key={block.id} id={`block-${block.id}`}>
        {content}
      </div>
    );
  };

  const renderSection = (section: Section) => {
    const sectionBlocks = getBlocksForSection(section.id);
  const contentBlocks = sectionBlocks.filter((b) => {
    if (b.type === "heading") return false;
    const role = String(b.metadata?.role ?? "");
    return role !== "author" && role !== "affiliation" && role !== "copyright";
  });

    const HeadingTag = `h${Math.min(section.level + 1, 6)}` as keyof React.JSX.IntrinsicElements;

    return (
      <section
        key={section.id}
        id={`section-${section.id}`}
        className={styles.section}
        ref={(el) => registerSectionRef(section.id, el)}
      >
        <HeadingTag className={styles[`heading${section.level}`]}>
          {sectionDisplayTitle(section)}
        </HeadingTag>
        {contentBlocks.map(renderBlock)}
      </section>
    );
  };

  const allSectionsOrdered = [...sections].sort((a, b) => a.order - b.order);
  const sectionIds = new Set(allSectionsOrdered.map((s) => s.id));
  const orphanBlocks = blocks
    .filter((b) => {
      const role = String(b.metadata?.role ?? "");
      if (role === "author" || role === "affiliation" || role === "copyright") {
        return false;
      }
      return !b.sectionId || !sectionIds.has(b.sectionId);
    })
    .sort((a, b) => a.order - b.order);

  const isProcessing = paper.processingStatus !== "ready" && paper.processingStatus !== "failed";
  const translatableBlocks = blocks.filter(
    (b) =>
      b.original &&
      (b.type === "paragraph" || b.type === "heading") &&
      b.translationStatus !== "skipped" &&
      String(b.metadata?.role ?? "") !== "author" &&
      String(b.metadata?.role ?? "") !== "affiliation" &&
      !looksLikeBibliographyEntry(b.original)
  );
  const translatedCount = translatableBlocks.filter((b) => b.translated).length;
  const totalCount = translatableBlocks.length;
  const hasContent =
    allSectionsOrdered.length > 0 || blocks.length > 0 || orphanBlocks.length > 0;


  return (
    <article className={styles.article}>
      {/* Title */}
      <header className={styles.header}>
        <h1 className={styles.title}>
          {displayPaperTitle(paper)}
        </h1>
        {usableTranslatedText(paper.titleTranslated, paper.titleOriginal) &&
          paper.titleOriginal &&
          !isGarbageTitle(paper.titleOriginal) && (
          <p className={styles.originalTitle}>{paper.titleOriginal}</p>
        )}
        {paper.authors.length > 0 && (
          <p className={styles.authors}>{paper.authors.join(", ")}</p>
        )}
        {paper.publication && (
          <p className={styles.publication}>
            {paper.publication}
            {paper.year && ` (${paper.year})`}
          </p>
        )}
      </header>

      {/* Processing Status */}
      {isProcessing && (
        <div className={styles.processingBanner}>
          <span className={styles.processingSpinner} />
          <span>
            {paper.processingStatus === "extracting" && "テキストを抽出中..."}
            {paper.processingStatus === "structuring" && "構造を解析中..."}
            {paper.processingStatus === "translating" && (
              <>
                翻訳中
                {totalCount > 0 ? `... (${translatedCount}/${totalCount})` : "..."}
              </>
            )}
            {paper.processingStatus === "glossary" && "用語集を生成中..."}
            {paper.processingStatus === "queued" && "処理待ち..."}
          </span>
        </div>
      )}

      {/* Content */}
      <div className={styles.content}>
        {hasContent ? (
          <>
            {orphanBlocks.length > 0 && (
              <div className={styles.section}>{orphanBlocks.map(renderBlock)}</div>
            )}
            {allSectionsOrdered.map((section) => renderSection(section))}
          </>
        ) : (
          <div className={styles.emptyContent}>
            {isProcessing ? (
              <p>コンテンツを準備中です。しばらくお待ちください...</p>
            ) : paper.processingStatus === "failed" ? (
              <p>処理に失敗しました。再度インポートしてください。</p>
            ) : (
              <p>コンテンツがありません。</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
