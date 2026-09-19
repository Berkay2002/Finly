import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PushState {
  /** Random id this device registers its reminders under. Never derived from the plan or the sync phrase. */
  deviceId: string;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/** Reminders are a device preference, like the theme: they do not sync. */
export const usePushStore = create<PushState>()(
  persist(
    (set) => ({
      deviceId: crypto.randomUUID(),
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: 'finly.push.v1' },
  ),
);
