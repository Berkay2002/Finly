import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { dateLocale, useT } from '@/i18n';
import { useSyncActions } from '@/sync/useSync';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

/**
 * Two devices edited the plan while apart. Nothing is overwritten until the user picks a side;
 * closed months from both copies are kept whichever side wins.
 */
export function SyncBanner({ className }: { className?: string }) {
  const sync = useSyncActions();
  const [busy, setBusy] = useState(false);
  const t = useT().sync.banner;

  if (!sync.configured || sync.status !== 'conflict' || !sync.conflict) return null;

  const { newer, remoteUpdatedAt } = sync.conflict;
  const when = formatDistanceToNow(new Date(remoteUpdatedAt), { addSuffix: true, locale: dateLocale() });
  const choose = async (keep: 'local' | 'remote') => {
    setBusy(true);
    try {
      await sync.resolve(keep);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Callout
      tone="warning"
      className={className}
      title={t.title}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant={newer === 'local' ? 'primary' : 'secondary'} disabled={busy} onClick={() => choose('local')}>
            {t.keepMine}
          </Button>
          <Button size="sm" variant={newer === 'remote' ? 'primary' : 'secondary'} disabled={busy} onClick={() => choose('remote')}>
            {t.useTheirs}
          </Button>
        </div>
      }
    >
      {t.body(when, newer === 'remote')}
    </Callout>
  );
}
