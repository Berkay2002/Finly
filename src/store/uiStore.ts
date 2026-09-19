import { addMonths, isSameMonth, startOfMonth } from 'date-fns';
import { create } from 'zustand';

interface UiState {
  /** First day of the month being viewed. */
  viewMonth: Date;
  shiftMonth: (delta: number) => void;
  setViewMonth: (month: Date) => void;
  resetMonth: () => void;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  viewMonth: startOfMonth(new Date()),
  shiftMonth: (delta) => set((s) => ({ viewMonth: addMonths(s.viewMonth, delta) })),
  setViewMonth: (viewMonth) => set({ viewMonth: startOfMonth(viewMonth) }),
  resetMonth: () => set({ viewMonth: startOfMonth(new Date()) }),
  moreOpen: false,
  setMoreOpen: (moreOpen) => set({ moreOpen }),
  quickAddOpen: false,
  setQuickAddOpen: (quickAddOpen) => set({ quickAddOpen }),
}));

/** The "now" used for calculations: today when viewing the current month, else the 1st of that month. */
export function viewDateFor(viewMonth: Date): Date {
  const today = new Date();
  return isSameMonth(viewMonth, today) ? today : viewMonth;
}
