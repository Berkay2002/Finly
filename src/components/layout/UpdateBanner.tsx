import { useRegisterSW } from 'virtual:pwa-register/react';
import { useState } from 'react';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

/** Registers the service worker and offers a reload when a newer build has been installed. */
export function UpdateBanner({ className }: { className?: string }) {
  const t = useT().layout.update;
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new build once an hour while the app stays open.
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000);
    },
  });

  if (!needRefresh || dismissed) return null;

  return (
    <Callout
      tone="tip"
      className={className}
      title={t.title}
      action={
        <div className="flex gap-2">
          <Button size="sm" onClick={() => updateServiceWorker(true)}>
            {t.reload}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDismissed(true);
              setNeedRefresh(false);
            }}
          >
            {t.later}
          </Button>
        </div>
      }
    >
      {t.body}
    </Callout>
  );
}
