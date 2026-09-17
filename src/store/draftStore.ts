import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PurchaseKind = 'car' | 'home' | 'computer' | 'phone' | 'trip' | 'other';
/** One "Can I afford this?" tool: a kind of big purchase, or a new monthly cost. */
export type AffordTab = PurchaseKind | 'monthly';
export type DraftValues = Record<string, unknown>;

interface DraftState {
  mode: 'purchase' | 'monthly';
  kind: PurchaseKind;
  /** What is typed into each tool right now, kept on this device until saved or cleared. */
  drafts: Partial<Record<AffordTab, DraftValues>>;
  /** The saved scenario each tool was opened from, so saving again updates it. */
  openIds: Partial<Record<AffordTab, string>>;
  setMode: (mode: 'purchase' | 'monthly') => void;
  setKind: (kind: PurchaseKind) => void;
  setValue: (tab: AffordTab, key: string, value: unknown) => void;
  /** Put values into a tool and show it; `id` links them to a saved scenario. */
  open: (tab: AffordTab, values: DraftValues, id?: string) => void;
  clear: (tab: AffordTab) => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      mode: 'purchase',
      kind: 'car',
      drafts: {},
      openIds: {},
      setMode: (mode) => set({ mode }),
      setKind: (kind) => set({ kind }),
      setValue: (tab, key, value) => set((s) => ({ drafts: { ...s.drafts, [tab]: { ...s.drafts[tab], [key]: value } } })),
      open: (tab, values, id) =>
        set((s) => ({
          ...(tab === 'monthly' ? { mode: 'monthly' as const } : { mode: 'purchase' as const, kind: tab }),
          drafts: { ...s.drafts, [tab]: values },
          openIds: { ...s.openIds, [tab]: id },
        })),
      clear: (tab) => set((s) => ({ drafts: { ...s.drafts, [tab]: undefined }, openIds: { ...s.openIds, [tab]: undefined } })),
    }),
    { name: 'finly-afford-drafts', version: 1 },
  ),
);

export const tabOf = (s: { mode: DraftState['mode']; kind: PurchaseKind }): AffordTab => (s.mode === 'monthly' ? 'monthly' : s.kind);

/**
 * A tool's inputs, kept in the draft store instead of component state:
 * `const [price, setPrice] = field('price', 0)`, the same shape as `useState`.
 */
export function useDraft(tab: AffordTab) {
  const values = useDraftStore((s) => s.drafts[tab]);
  const setValue = useDraftStore((s) => s.setValue);
  return function field<T>(key: string, initial: T | (() => T)): [T, (value: T) => void] {
    const value = values && key in values ? (values[key] as T) : typeof initial === 'function' ? (initial as () => T)() : initial;
    return [value, (v: T) => setValue(tab, key, v)];
  };
}
