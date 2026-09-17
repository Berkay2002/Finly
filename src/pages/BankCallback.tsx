import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { completeAuth } from '@/bank/bankActions';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { LinkButton } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

/** Where the bank sends the person back to. On success Settings takes over and asks what each account is. */
export function BankCallback() {
  const [params] = useSearchParams();
  const hydrated = usePlanStore((s) => s.hydrated);
  const [outcome, setOutcome] = useState<'working' | 'done' | { error: string }>('working');
  const t = useT().bank.callback;

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    completeAuth(params)
      .then(() => !cancelled && setOutcome('done'))
      .catch((e) => !cancelled && setOutcome({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  if (outcome === 'done') return <Navigate to="/settings" replace />;
  if (outcome === 'working') return <p className="py-10 text-center text-[13.5px] text-muted">{t.working}</p>;
  return (
    <Callout tone="warning" action={<LinkButton to="/settings">{t.back}</LinkButton>}>
      {t.failed(outcome.error)}
    </Callout>
  );
}
