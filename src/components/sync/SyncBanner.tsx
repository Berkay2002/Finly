import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
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

  if (!sync.configured || sync.status !== 'conflict' || !sync.conflict) return null;

  const { newer, remoteUpdatedAt } = sync.conflict;
  const when = formatDistanceToNow(new Date(remoteUpdatedAt), { addSuffix: true });
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
      title="Another device changed this plan"
      action={
        <div className="flex gap-2">
          <Button size="sm" variant={newer === 'local' ? 'primary' : 'secondary'} disabled={busy} onClick={() => choose('local')}>
            Keep mine
          </Button>
          <Button size="sm" variant={newer === 'remote' ? 'primary' : 'secondary'} disabled={busy} onClick={() => choose('remote')}>
            Use theirs
          </Button>
        </div>
      }
    >
      The cloud copy was saved {when} and this device has edits it has not sent yet.{' '}
      {newer === 'remote' ? 'The cloud copy is newer.' : 'This device’s copy is newer.'} Closed months from both are kept
      either way.
    </Callout>
  );
}
