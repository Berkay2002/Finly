import { formatDistanceToNow } from 'date-fns';
import { Check, Cloud, CloudOff, Copy, Eye, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { dateLocale, useT } from '@/i18n';
import { PHRASE_WORDS, PhraseError, describePhraseError, normalizePhrase } from '@/sync/phrase';
import { useSyncActions, type JoinOutcome } from '@/sync/useSync';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { CardHeader } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';

type Mode = 'closed' | 'new' | 'join' | 'show';

/**
 * Sync without an account: a 12-word phrase is the whole identity. The phrase never leaves the
 * device; the server stores one encrypted blob under an id derived from it.
 * Renders as a section; the caller supplies the surrounding card.
 */
export function SyncCard({ onMessage }: { onMessage: (tone: 'success' | 'warning', text: string) => void }) {
  const sync = useSyncActions();
  const [mode, setMode] = useState<Mode>('closed');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = useT().sync.card;

  if (!sync.configured) {
    return (
      <div>
        <CardHeader title={t.title} subtitle={t.notConfigured} />
      </div>
    );
  }

  const on = sync.status !== 'off';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onMessage('warning', e instanceof Error ? e.message : t.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <CardHeader
        title={t.title}
        subtitle={t.subtitle}
      />
      {on ? (
        <div className="space-y-3">
          <StatusLine status={sync.status} error={sync.error} lastSyncedAt={sync.lastSyncedAt} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Eye} onClick={() => setMode('show')}>
              {t.showPhrase}
            </Button>
            {sync.status === 'error' && (
              <Button variant="secondary" icon={RefreshCw} onClick={sync.retry}>
                {t.tryAgain}
              </Button>
            )}
            <Button variant="secondary" icon={CloudOff} onClick={sync.turnOff}>
              {t.turnOff}
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
                      onMessage('success', t.deleted);
                    })
                  }
                >
                  {t.confirmDelete}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  {t.cancel}
                </Button>
              </>
            ) : (
              <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                {t.deleteCloud}
              </Button>
            )}
          </div>
          <p className="text-[12px] text-muted">
            {t.offExplainer}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button icon={Cloud} onClick={() => setMode('new')}>
            {t.turnOn}
          </Button>
          <Button variant="secondary" icon={KeyRound} onClick={() => setMode('join')}>
            {t.havePhrase}
          </Button>
        </div>
      )}

      <NewPhraseSheet
        open={mode === 'new'}
        onClose={() => setMode('closed')}
        onDone={() => {
          setMode('closed');
          onMessage('success', t.turnedOn);
        }}
      />
      <JoinSheet
        open={mode === 'join'}
        onClose={() => setMode('closed')}
        onDone={(outcome) => {
          setMode('closed');
          if (outcome === 'downloaded') onMessage('success', t.downloaded);
          else if (outcome === 'uploaded') onMessage('success', t.uploaded);
          else onMessage('warning', t.conflict);
        }}
      />
      <ShowPhraseSheet open={mode === 'show'} onClose={() => setMode('closed')} />
    </div>
  );
}

function StatusLine({ status, error, lastSyncedAt }: { status: string; error?: string; lastSyncedAt?: string }) {
  const t = useT().sync.status;
  const dot = { idle: 'bg-positive', syncing: 'bg-blue-500 animate-pulse', conflict: 'bg-orange-500', error: 'bg-negative' }[status] ?? 'bg-faint';
  const text =
    status === 'syncing'
      ? t.syncing
      : status === 'conflict'
        ? t.needsDecision
        : status === 'error'
          ? t.couldNotSync(error ?? t.unknownError)
          : lastSyncedAt
            ? t.synced(formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true, locale: dateLocale() }))
            : t.waiting;
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
  const t = useT().sync.copy;
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
      {copied ? t.copied : t.copyPhrase}
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
  const t = useT().sync;

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
      title={t.newPhrase.title}
      subtitle={t.newPhrase.subtitle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {t.card.cancel}
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
                setError(e instanceof Error ? e.message : t.newPhrase.couldNotTurnOn);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t.card.turnOn}
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
            <span>{t.newPhrase.saved}</span>
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
  const t = useT().sync;

  const close = () => {
    setText('');
    setError(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t.join.title}
      subtitle={t.join.subtitle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {t.card.cancel}
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
            {t.join.connect}
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
          placeholder={t.join.placeholder}
          className="w-full rounded-xl border border-line bg-card px-3 py-2 text-[14px] text-ink outline-none focus:border-brand-400"
        />
        <p className="text-[12px] text-muted">
          {words.length === 0 ? t.join.pasteHint : t.join.wordCount(words.length, PHRASE_WORDS)}
        </p>
        {error && <Callout tone="warning">{error}</Callout>}
      </div>
    </Sheet>
  );
}

function ShowPhraseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sync = useSyncActions();
  const words = open ? sync.phrase() : null;
  const t = useT().sync.show;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.title}
      subtitle={t.subtitle}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>{t.done}</Button>
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
