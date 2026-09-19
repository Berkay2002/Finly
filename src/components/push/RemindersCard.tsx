import { useState } from 'react';
import { useT } from '@/i18n';
import { disablePush, enablePush, pushConfigured } from '@/push/usePush';
import { usePushStore } from '@/push/pushStore';
import { useInstall } from '@/pwa/InstallBanner';
import { Callout } from '@/components/ui/Callout';
import { CardHeader } from '@/components/ui/Card';
import { Switch } from '@/components/ui/fields';

/** Reminders while the app is closed. Renders as a section; the caller supplies the surrounding card. */
export function RemindersCard({ onMessage }: { onMessage: (tone: 'success' | 'warning', text: string) => void }) {
  const t = useT().settings.reminders;
  const enabled = usePushStore((s) => s.enabled);
  const { isIOS, standalone } = useInstall();
  const [busy, setBusy] = useState(false);
  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied';

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        if (!(await enablePush())) onMessage('warning', t.refused);
      } else await disablePush();
    } catch {
      onMessage('warning', t.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <CardHeader title={t.title} subtitle={pushConfigured ? t.subtitle : t.notConfigured} />
      {pushConfigured &&
        (isIOS && !standalone ? (
          <Callout tone="tip">{t.installFirst}</Callout>
        ) : denied ? (
          <Callout tone="warning">{t.denied}</Callout>
        ) : (
          <>
            <Switch checked={enabled} onChange={(on) => !busy && void toggle(on)} label={t.switch} />
            <p className="mt-2 text-[12px] text-muted">{t.privacy}</p>
          </>
        ))}
    </div>
  );
}
