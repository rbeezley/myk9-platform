import { create } from 'zustand';
import type { NotificationPayload } from '@myk9/notifications';

export interface ToastEntry {
  payload: NotificationPayload;
  createdAt: number;
}

interface ToastState {
  toasts: ToastEntry[];
  addToast: (payload: NotificationPayload) => void;
  dismissToast: (id: string) => void;
}

const MAX_VISIBLE_TOASTS = 3;

export const useToastStore = create<ToastState>()(set => ({
  toasts: [],

  addToast: payload =>
    set(state => {
      if (state.toasts.some(t => t.payload.id === payload.id)) return state;

      const entry: ToastEntry = { payload, createdAt: Date.now() };
      const updated = [...state.toasts, entry];

      return { toasts: updated.slice(-MAX_VISIBLE_TOASTS) };
    }),

  dismissToast: id =>
    set(state => ({
      toasts: state.toasts.filter(t => t.payload.id !== id),
    })),
}));
