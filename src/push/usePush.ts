import { useEffect } from 'react';
import { api } from '../../convex/_generated/api';
import { loadKey, saveKey } from '@/bank/keyStore';
import { messages } from '@/i18n';
import { useGovBondRate } from '@/store/selectors';
import { usePlanStore } from '@/store/planStore';
import { convex } from '@/sync/convexClient';
import { encryptJson } from '@/sync/crypto';
import type { GovBondRate } from '@/engine/rates';
import { usePushStore } from './pushStore';
import { buildReminders } from './reminders';

const VAPID_PUBLIC_KEY: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const UPLOAD_DELAY_MS = 5000;

/** True when this build can register reminders at all. */
export const pushConfigured = Boolean(convex && VAPID_PUBLIC_KEY && typeof window !== 'undefined' && 'PushManager' in window);

// Module-level like useSync.ts: one timer no matter how often the hook mounts.
let uploadTimer: ReturnType<typeof setTimeout> | undefined;
let lastGov: GovBondRate | undefined;

/** The VAPID key as bytes: the string form is legal but has been flaky in Safari. */
function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pushKey(): Promise<CryptoKey> {
  const existing = await loadKey('push');
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await saveKey(key, 'push');
  return key;
}

/** Re-reads the subscription each time: an endpoint the browser rotated is picked up on the next upload. */
async function upload(): Promise<void> {
  if (!convex) return;
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!sub) return;
  const key = await pushKey();
  const { plan } = usePlanStore.getState();
  const reminders = buildReminders(plan, new Date(), messages().push, lastGov);
  const sealed = await Promise.all(reminders.map((r) => encryptJson(key, { title: r.title, body: r.body, url: r.url })));
  await convex.mutation(api.push.register, {
    deviceId: usePushStore.getState().deviceId,
    subscription: JSON.stringify(sub.toJSON()),
    reminders: sealed.map((s, i) => ({ fireAt: reminders[i].fireAt, ...s })),
  });
}

function scheduleUpload(delay = UPLOAD_DELAY_MS) {
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => void upload().catch(() => undefined), delay);
}

/** Call from a click: the permission prompt needs the gesture. Resolves false when permission was refused. */
export async function enablePush(): Promise<boolean> {
  if (!pushConfigured || (await Notification.requestPermission()) !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY!) });
  usePushStore.getState().setEnabled(true);
  await upload();
  return true;
}

export async function disablePush(): Promise<void> {
  usePushStore.getState().setEnabled(false);
  clearTimeout(uploadTimer);
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  await sub?.unsubscribe();
  await convex?.mutation(api.push.unregister, { deviceId: usePushStore.getState().deviceId });
}

/** Mount once in the app shell: keeps the server's reminder list in step with the plan while reminders are on. */
export function usePushReminders(): void {
  const enabled = usePushStore((s) => s.enabled);
  const hydrated = usePlanStore((s) => s.hydrated);
  lastGov = useGovBondRate();
  useEffect(() => {
    if (!enabled || !hydrated || !pushConfigured) return;
    scheduleUpload(0);
    const onVisible = () => document.visibilityState === 'visible' && scheduleUpload(0);
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = usePlanStore.subscribe((s, prev) => {
      if (s.plan !== prev.plan) scheduleUpload();
    });
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
    };
  }, [enabled, hydrated]);
}
