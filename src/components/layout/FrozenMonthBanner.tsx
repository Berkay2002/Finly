import { formatDate, formatMonthKey } from '@/engine/format';
import { useT } from '@/i18n';
import { useFrozenMonth } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

/**
 * Shown while a closed month is on screen. Its numbers come from the plan as it stood at close;
 * edits made now go to the current plan, except bills, which belong to the month they are entered in.
 */
export function FrozenMonthBanner({ className }: { className?: string }) {
  const { key, frozen, snapshot } = useFrozenMonth();
  const resetMonth = useUiStore((s) => s.resetMonth);
  const t = useT().layout.frozenMonth;
  if (!frozen || !snapshot) return null;
  return (
    <Callout
      tone="neutral"
      icon="card-upcoming"
      className={className}
      title={t.title(formatMonthKey(key), formatDate(snapshot.savedAt))}
      action={
        <Button size="sm" variant="soft" onClick={resetMonth}>
          {t.back}
        </Button>
      }
    >
      {t.body}
    </Callout>
  );
}
