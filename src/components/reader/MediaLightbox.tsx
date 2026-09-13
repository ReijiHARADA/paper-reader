import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./MediaLightbox.module.css";

const MOTION_MS = 320;

type Rect = { top: number; left: number; width: number; height: number };

type MediaLightboxProps = {
  open: boolean;
  src: string;
  alt: string;
  caption?: ReactNode;
  /** Inline image that morphs into the lightbox (Shared Element). */
  sourceRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** True while the portal (including exit motion) is on screen. */
  onSurfaceChange?: (active: boolean) => void;
};

function readRect(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function fitContain(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  if (naturalW <= 0 || naturalH <= 0) {
    return { width: Math.min(maxW, 640), height: Math.min(maxH, 480) };
  }
  const scale = Math.min(maxW / naturalW, maxH / naturalH);
  return { width: naturalW * scale, height: naturalH * scale };
}

function flipTransform(from: Rect, to: Rect): string {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}

/**
 * Shared-element lightbox: the image grows from its inline frame into the
 * overlay (and shrinks back on close) so the view never cuts away.
 */
export function MediaLightbox({
  open,
  src,
  alt,
  caption,
  sourceRef,
  onClose,
  onSurfaceChange,
}: MediaLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"enter" | "open" | "exit">("enter");
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sourceSnapshot = useRef<Rect | null>(null);
  const activeRef = useRef(false);
  const enterToken = useRef(0);
  const onSurfaceChangeRef = useRef(onSurfaceChange);
  onSurfaceChangeRef.current = onSurfaceChange;

  useEffect(() => {
    if (open) {
      // Snapshot while the inline image is still visible, then hide it.
      sourceSnapshot.current = readRect(sourceRef.current);
      enterToken.current += 1;
      activeRef.current = true;
      onSurfaceChangeRef.current?.(true);
      setMounted(true);
      setPhase("enter");
      return;
    }
    if (activeRef.current) {
      sourceSnapshot.current = readRect(sourceRef.current) ?? sourceSnapshot.current;
      setPhase("exit");
    }
  }, [open, sourceRef]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  useLayoutEffect(() => {
    if (!mounted || phase !== "enter") return;
    const img = imageRef.current;
    const stage = stageRef.current;
    if (!img || !stage) return;
    const token = enterToken.current;

    const applyEnter = () => {
      if (token !== enterToken.current) return;
      const from = sourceSnapshot.current;
      const maxW = Math.min(window.innerWidth * 0.9, stage.clientWidth || window.innerWidth * 0.9);
      const captionReserve = caption ? 72 : 24;
      const maxH = Math.min(window.innerHeight * 0.9 - captionReserve, window.innerHeight * 0.85);
      const naturalW = img.naturalWidth || from?.width || maxW;
      const naturalH = img.naturalHeight || from?.height || maxH;
      const size = fitContain(naturalW, naturalH, maxW, maxH);

      img.style.width = `${size.width}px`;
      img.style.height = `${size.height}px`;
      img.style.opacity = "1";

      const to = img.getBoundingClientRect();
      if (from) {
        img.style.transform = flipTransform(from, to);
      } else {
        img.style.transform = "scale(0.92)";
        img.style.opacity = "0";
      }
      img.style.transition = "none";

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (token !== enterToken.current) return;
          img.style.transition = `transform ${MOTION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${MOTION_MS}ms ease-out`;
          img.style.transform = "none";
          img.style.opacity = "1";
          setPhase("open");
        });
      });
    };

    if (img.complete && img.naturalWidth > 0) {
      applyEnter();
      return;
    }
    img.addEventListener("load", applyEnter, { once: true });
    return () => img.removeEventListener("load", applyEnter);
  }, [mounted, phase, caption]);

  useLayoutEffect(() => {
    if (!mounted || phase !== "exit") return;
    const img = imageRef.current;
    if (!img) {
      activeRef.current = false;
      onSurfaceChangeRef.current?.(false);
      setMounted(false);
      return;
    }

    const from = sourceSnapshot.current;
    const to = img.getBoundingClientRect();
    img.style.transition = `transform ${MOTION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${MOTION_MS * 0.75}ms ease-in`;

    requestAnimationFrame(() => {
      if (from) {
        img.style.transform = flipTransform(from, to);
      } else {
        img.style.transform = "scale(0.92)";
        img.style.opacity = "0";
      }
    });

    const timer = window.setTimeout(() => {
      activeRef.current = false;
      onSurfaceChangeRef.current?.(false);
      setMounted(false);
    }, MOTION_MS + 20);

    return () => window.clearTimeout(timer);
  }, [mounted, phase]);

  if (!mounted) return null;

  const backdropClass =
    phase === "enter"
      ? `${styles.overlay} ${styles.overlayEnter}`
      : phase === "exit"
        ? `${styles.overlay} ${styles.overlayExit}`
        : `${styles.overlay} ${styles.overlayOpen}`;

  return createPortal(
    <div
      className={backdropClass}
      role="dialog"
      aria-modal="true"
      aria-label="拡大表示"
      onClick={onClose}
    >
      <button
        type="button"
        className={styles.closeButton}
        onClick={onClose}
        title="閉じる"
      >
        <X size={24} />
      </button>
      <div
        ref={stageRef}
        className={styles.stage}
        onClick={(event) => event.stopPropagation()}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          className={styles.image}
          draggable={false}
        />
        {caption && (
          <div
            className={`${styles.caption} ${
              phase === "open" ? styles.captionVisible : ""
            }`}
          >
            {caption}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
