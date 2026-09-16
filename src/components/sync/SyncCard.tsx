import { formatDistanceToNow } from 'date-fns';
import { Check, Cloud, CloudOff, Copy, Eye, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { PhraseError, describePhraseError, normalizePhrase } from '@/sync/phrase';
import { useSyncActions, type JoinOutcome } from '@/sync/useSync';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';

type Mode = 'closed' | 'new' | 'join' | 'show';

/**
 * Sync without an account: a 12-word phrase is the whole identity. The phrase never leaves the
 * device; the server stores one encrypted blob under an id derived from it.
 */
export function SyncCard({ onMessage }: { onMessage: (tone: 'success' | 'warning', text: string) => void }) {
  const sync = useSyncActions();
  const [mode, setMode] = useState<Mode>('closed');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!sync.configured) {
    return (
      <Card>
        <CardHeader title="Sync between devices" subtitle="Sync is not configured in this build. Your data stays in this browser." />
      </Card>
    );
  }

  const on = sync.status !== 'off';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onMessage('warning', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Sync between devices"
        subtitle="No account. A 12-word phrase links your devices; everything is encrypted before it leaves this one."
      />
      {on ? (
        <div className="space-y-3">
          <StatusLine status={sync.status} error={sync.error} lastSyncedAt={sync.lastSyncedAt} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Eye} onClick={() => setMode('show')}>
              Show phrase
            </Button>
            {sync.status === 'error' && (
              <Button variant="secondary" icon={RefreshCw} onClick={sync.retry}>
                Try again
              </Button>
            )}
            <Button variant="secondary" icon={CloudOff} onClick={sync.turnOff}>
              Turn off sync
            </Button>
            {confirmDelete ? (
              <>
                <Button
                  variant="danger"
                  icon={Trash2}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await sync.deleteCloud();
                      setConfirmDelete(false);
                      onMessage('success', 'The cloud copy was deleted. Your data is still here.');
                    })
                  }
                >
                  Yes, delete the cloud copy
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Delete cloud copy
              </Button>
            )}
          </div>
          <p className="text-[12px] text-muted">
            Turning sync off keeps your data here and in the cloud. Deleting the cloud copy removes it for every device; each
            device keeps its own local data.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button icon={Cloud} onClick={() => setMode('new')}>
            Turn on sync
          </Button>
          <Button variant="secondary" icon={KeyRound} onClick={() => setMode('join')}>
            I have a phrase
          </Button>
        </div>
      )}

      <NewPhraseSheet
        open={mode === 'new'}
        onClose={() => setMode('closed')}
        onDone={() => {
          setMode('closed');
          onMessage('success', 'Sync is on. Use the same phrase on your other devices.');
        }}
      />
      <JoinSheet
        open={mode === 'join'}
        onClose={() => setMode('closed')}
        onDone={(outcome) => {
          setMode('closed');
          if (outcome === 'downloaded') onMessage('success', 'Your plan was downloaded from the cloud.');
          else if (outcome === 'uploaded') onMessage('success', 'No cloud copy existed for that phrase yet, so this device’s plan was uploaded.');
          else onMessage('warning', 'This device and the cloud both have a plan. Choose which one to keep at the top of the page.');
        }}
      />
      <ShowPhraseSheet open={mode === 'show'} onClose={() => setMode('closed')} />
    </Card>
  );
}

function StatusLine({ status, error, lastSyncedAt }: { status: string; error?: string; lastSyncedAt?: string }) {
  const dot = { idle: 'bg-positive', syncing: 'bg-blue-500 animate-pulse', conflict: 'bg-orange-500', error: 'bg-negative' }[status] ?? 'bg-faint';
  const text =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'conflict'
        ? 'Needs your decision'
        : status === 'error'
          ? `Could not sync: ${error ?? 'unknown error'}`
          : lastSyncedAt
            ? `Synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}`
            : 'Waiting for the first sync';
  return (
    <div className="flex items-center gap-2 text-[13px] text-ink">
      <span className={clsx('inline-block h-2 w-2 rounded-full', dot)} />
      {text}
    </div>
  );
}

function PhraseGrid({ words }: { words: string[] }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {words.map((w, i) => (
        <li key={i} className="flex items-center gap-2 rounded-lg border border-line bg-page px-2.5 py-2 text-[13.5px]">
          <span className="tabular w-5 text-right text-[11px] text-faint">{i + 1}</span>
          <span className="font-medium text-ink">{w}</span>
        </li>
      ))}
    </ol>
  );
}

function CopyButton({ words }: { words: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={copied ? Check : Copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(words.join(' '));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable: the words are on screen */
        }
      }}
    >
      {copied ? 'Copied' : 'Copy phrase'}
    </Button>
  );
}

function NewPhraseSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const sync = useSyncActions();
  const [draft, setDraft] = useState<{ secret: Uint8Array; words: string[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = open ? draft : null;

  // A fresh phrase each time the sheet opens; it only becomes real once the button is pressed.
  useEffect(() => {
    if (open) setDraft(sync.draftPhrase());
  }, [open]);

  const close = () => {
    setDraft(null);
    setSaved(false);
    setError(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Your sync phrase"
      subtitle="Write these 12 words down or put them in a password manager. They are the only way to read your cloud copy, and they cannot be recovered."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!saved || busy}
            onClick={async () => {
              if (!current) return;
              setBusy(true);
              setError(null);
              try {
                await sync.startNew(current.secret);
                close();
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not turn on sync.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Turn on sync
          </Button>
        </div>
      }
    >
      {current && (
        <div className="space-y-4">
          <PhraseGrid words={current.words} />
          <div className="flex items-center justify-between gap-2">
            <CopyButton words={current.words} />
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
            <input type="checkbox" className="mt-0.5" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>I have saved my phrase somewhere safe.</span>
          </label>
          {error && <Callout tone="warning">{error}</Callout>}
        </div>
      )}
    </Sheet>
  );
}

function JoinSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (outcome: JoinOutcome) => void }) {
  const sync = useSyncActions();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = normalizePhrase(text);

  const close = () => {
    setText('');
    setError(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Enter your sync phrase"
      subtitle="The 12 words shown when sync was turned on on your other device."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={words.length === 0 || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const outcome = await sync.join(words);
                close();
                onDone(outcome);
              } catch (e) {
                setError(e instanceof PhraseError ? describePhraseError(e) : e instanceof Error ? e.message : describePhraseError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Connect
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="word word word …"
          className="w-full rounded-xl border border-line bg-card px-3 py-2 text-[14px] text-ink outline-none focus:border-brand-400"
        />
        <p className="text-[12px] text-muted">
          {words.length === 0 ? 'Paste or type the words, in order.' : `${words.length} of 12 words`}
        </p>
        {error && <Callout tone="warning">{error}</Callout>}
      </div>
    </Sheet>
  );
}

function ShowPhraseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sync = useSyncActions();
  const words = open ? sync.phrase() : null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your sync phrase"
      subtitle="Enter these words on another device to sync it with this one."
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      {words && (
        <div className="space-y-4">
          <PhraseGrid words={words} />
          <CopyButton words={words} />
        </div>
      )}
    </Sheet>
  );
}
