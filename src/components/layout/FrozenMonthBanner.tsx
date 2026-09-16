import { formatDate, formatMonthKey } from '@/engine/format';
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
  if (!frozen || !snapshot) return null;
  return (
    <Callout
      tone="neutral"
      icon="card-upcoming"
      className={className}
      title={`${formatMonthKey(key)} as it was closed on ${formatDate(snapshot.savedAt)}`}
      action={
        <Button size="sm" variant="soft" onClick={resetMonth}>
          Back to this month
        </Button>
      }
    >
      Edits to income, costs and balances apply to your current plan. Bill amounts you enter here stay with this month.
    </Callout>
  );
}
