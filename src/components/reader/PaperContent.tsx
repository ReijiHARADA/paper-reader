import { useEffect, useRef, useCallback, useMemo, memo } from "react";
import type { Paper, Section, PaperBlock, FigureMetadata, EquationMetadata, TableMetadata } from "../../types/paper";
import type { Annotation } from "../../types/annotation";
import { Paragraph } from "./Paragraph";
import { Figure } from "./Figure";
import { Equation } from "./Equation";
import { Table } from "./Table";
import { Footnote } from "./Footnote";
import { displayPaperTitle, usableTranslatedText, isGarbageTitle, sectionDisplayTitle, isReferencesHeading } from "../../services/translation/quality";
import { shouldTranslateBlock, isRetryableTranslationFailure } from "../../services/importServiceV2";
import { isBusyProcessingStatus } from "../../services/paperStatus";
import { indexReferenceBlocks } from "../../services/citations";
import styles from "./PaperContent.module.css";

const EMPTY_ANNOTATIONS: Annotation[] = [];

type PaperContentProps = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  onSectionVisible: (sectionId: string | null) => void;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
  annotations?: Annotation[];
  flashAnnotationIds?: string[];
  onHighlightClick?: (annotationIds: string[]) => void;
  onOpenSourcePdf?: (block: PaperBlock) => void;
};

type PaperBlockViewProps = {
  block: PaperBlock;
  highlightText?: string;
  onBlockUpdated?: (block: PaperBlock) => void;
  annotations: Annotation[];
  flashAnnotationIds?: string[];
  onHighlightClick?: (annotationIds: string[]) => void;
  onOpenSourcePdf?: (block: PaperBlock) => void;
  referenceIndex: Map<string, string>;
};

const PaperBlockView = memo(function PaperBlockView({
  block,
  highlightText,
  onBlockUpdated,
  annotations,
  flashAnnotationIds,
  onHighlightClick,
  onOpenSourcePdf,
  referenceIndex,
}: PaperBlockViewProps) {
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
          annotations={annotations}
          flashAnnotationIds={flashAnnotationIds}
          onHighlightClick={onHighlightClick}
          onOpenSourcePdf={onOpenSourcePdf}
          referenceIndex={referenceIndex}
        />
      );
      break;
    case "figure":
      content = <Figure block={block} metadata={block.metadata as FigureMetadata} />;
      break;
    case "table":
      content = <Table block={block} metadata={block.metadata as TableMetadata} />;
      break;
    case "equation":
      content = <Equation block={block} metadata={block.metadata as EquationMetadata} />;
      break;
    case "footnote":
      content = <Footnote block={block} />;
      break;
    case "reference": {
      const referenceId =
        typeof block.metadata.referenceId === "string" ? block.metadata.referenceId : undefined;
      content = (
        <p id={referenceId} className={styles.reference}>
          {block.original}
        </p>
      );
      break;
    }
    default:
      return null;
  }

  return <div id={`block-${block.id}`}>{content}</div>;
});

function isVisibleContentBlock(block: PaperBlock): boolean {
  if (block.type === "heading") return false;
  const role = String(block.metadata?.role ?? "");
  return role !== "author" && role !== "affiliation" && role !== "copyright";
}

export const PaperContent = memo(function PaperContent({
  paper,
  sections,
  blocks,
  onSectionVisible,
  highlightText,
  onBlockUpdated,
  annotations = EMPTY_ANNOTATIONS,
  flashAnnotationIds = [],
  onHighlightClick,
  onOpenSourcePdf,
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

  const referenceIndex = useMemo(() => indexReferenceBlocks(blocks), [blocks]);

  const annotationsByBlock = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    for (const annotation of annotations) {
      const list = map.get(annotation.blockId);
      if (list) list.push(annotation);
      else map.set(annotation.blockId, [annotation]);
    }
    return map;
  }, [annotations]);

  const allSectionsOrdered = useMemo(
    () => [...sections].sort((a, b) => a.order - b.order),
    [sections]
  );

  const sectionIds = useMemo(
    () => new Set(allSectionsOrdered.map((section) => section.id)),
    [allSectionsOrdered]
  );

  const refSectionIds = useMemo(
    () =>
      new Set(
        allSectionsOrdered
          .filter(
            (section) =>
              section.normalizedKind === "references" ||
              isReferencesHeading(section.originalTitle)
          )
          .map((section) => section.id)
      ),
    [allSectionsOrdered]
  );

  const blocksBySection = useMemo(() => {
    const map = new Map<string, PaperBlock[]>();
    for (const block of blocks) {
      if (!block.sectionId || !isVisibleContentBlock(block)) continue;
      const list = map.get(block.sectionId);
      if (list) list.push(block);
      else map.set(block.sectionId, [block]);
    }
    return map;
  }, [blocks]);

  const orphanBlocks = useMemo(
    () =>
      blocks
        .filter((block) => {
          if (!isVisibleContentBlock(block)) return false;
          return !block.sectionId || !sectionIds.has(block.sectionId);
        })
        .sort((a, b) => a.order - b.order),
    [blocks, sectionIds]
  );

  const banner = useMemo(() => {
    const translatableBlocks = blocks.filter((block) => shouldTranslateBlock(block, refSectionIds));
    const translatedCount = translatableBlocks.filter((block) => block.translated).length;
    const totalCount = translatableBlocks.length;
    const unfinishedCount = translatableBlocks.filter(
      (block) => block.translationStatus === "pending" || block.translationStatus === "processing"
    ).length;
    const failedCount = blocks.filter((block) =>
      isRetryableTranslationFailure(block, refSectionIds)
    ).length;
    const showBusyBanner =
      isBusyProcessingStatus(paper.processingStatus) &&
      (unfinishedCount > 0 ||
        paper.processingStatus === "extracting" ||
        paper.processingStatus === "structuring" ||
        paper.processingStatus === "glossary" ||
        paper.processingStatus === "queued");
    return {
      translatedCount,
      totalCount,
      unfinishedCount,
      failedCount,
      showBusyBanner,
      showPartialBanner: !showBusyBanner && failedCount > 0,
    };
  }, [blocks, paper.processingStatus, refSectionIds]);

  const renderBlock = (block: PaperBlock) => (
    <PaperBlockView
      key={block.id}
      block={block}
      highlightText={highlightText}
      onBlockUpdated={onBlockUpdated}
      annotations={annotationsByBlock.get(block.id) ?? EMPTY_ANNOTATIONS}
      flashAnnotationIds={flashAnnotationIds}
      onHighlightClick={onHighlightClick}
      onOpenSourcePdf={onOpenSourcePdf}
      referenceIndex={referenceIndex}
    />
  );

  const hasContent =
    allSectionsOrdered.length > 0 || blocks.length > 0 || orphanBlocks.length > 0;

  return (
    <article className={styles.article}>
      {banner.showBusyBanner && (
        <div className={styles.processingBanner}>
          <span className={styles.processingSpinner} />
          <span>
            {paper.processingStatus === "extracting" && "テキストを抽出中..."}
            {paper.processingStatus === "structuring" && "構造を解析中..."}
            {(paper.processingStatus === "translating" || banner.unfinishedCount > 0) &&
              paper.processingStatus !== "extracting" &&
              paper.processingStatus !== "structuring" &&
              paper.processingStatus !== "glossary" &&
              paper.processingStatus !== "queued" && (
              <>
                翻訳中
                {banner.totalCount > 0 ? `... (${banner.translatedCount}/${banner.totalCount})` : "..."}
              </>
            )}
            {paper.processingStatus === "glossary" && "用語集を生成中..."}
            {paper.processingStatus === "queued" && "処理待ち..."}
          </span>
        </div>
      )}
      {banner.showPartialBanner && (
        <div className={styles.partialBanner}>
          一部の段落の翻訳に失敗しています（{banner.failedCount}件）。該当箇所から再試行できます。
        </div>
      )}

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

      <div className={styles.content}>
        {hasContent ? (
          <>
            {orphanBlocks.length > 0 && (
              <div className={styles.section}>{orphanBlocks.map(renderBlock)}</div>
            )}
            {allSectionsOrdered.map((section) => {
              const contentBlocks = blocksBySection.get(section.id) ?? [];
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
            })}
          </>
        ) : (
          <div className={styles.emptyContent}>
            {banner.showBusyBanner ? (
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
});
