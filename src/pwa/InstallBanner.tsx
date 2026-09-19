import { useEffect, useState, useSyncExternalStore } from 'react';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

/** Chrome's deferred install prompt. Fires before React mounts, so it is caught at module level. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const DISMISSED = 'finly.pwa.installDismissed';

/** Whether this is running as an installed app, and how to get there from here. */
export function useInstall() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  // iPadOS reports itself as a Mac; the touch points give it away.
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return {
    standalone,
    isIOS,
    canPrompt,
    prompt: () => deferred?.prompt(),
  };
}

/** Suggests installing once the plan is real; dismissing hides it for good, Settings keeps the option. */
export function InstallBanner({ className }: { className?: string }) {
  const t = useT().layout.install;
  const { standalone, isIOS, canPrompt, prompt } = useInstall();
  const isSample = usePlanStore((s) => s.plan.isSample);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (standalone || isSample || dismissed || (!isIOS && !canPrompt)) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      /* private mode: shown again next time */
    }
  };

  return (
    <Callout
      tone="tip"
      className={className}
      title={t.title}
      action={
        <div className="flex gap-2">
          {canPrompt && (
            <Button size="sm" onClick={() => void prompt()}>
              {t.install}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={dismiss}>
            {t.later}
          </Button>
        </div>
      }
    >
      {isIOS && !canPrompt ? t.ios : t.body}
    </Callout>
  );
}
