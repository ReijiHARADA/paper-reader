import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";

export type AppToast = {
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastState = {
  toast: AppToast | null;
  showToast: (toast: AppToast) => void;
  clearToast: () => void;
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => {
      set({ toast: null });
      toastTimer = undefined;
    }, toast.onAction ? 6000 : 3200);
  },
  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = undefined;
    set({ toast: null });
  },
}));

export function showToast(toast: AppToast): void {
  useToastStore.getState().showToast(toast);
}
