import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDate, formatMoney, formatNumber } from '@/engine/format';
import { capitalTaxSummary, lossValue, type AccountTax, type CapitalTaxSummary } from '@/engine/tax/capital';
import { accountKindMeta } from '@/engine/taxonomy';
import { useT } from '@/i18n';
import { useRateOutlook } from '@/lib/rateOutlook';
import { useCurrency, useEffectivePlan, useMetrics, useViewDate } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IconTile } from '@/components/ui/IconTile';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Sheet } from '@/components/ui/Sheet';

const percent = (n: number) => `${formatNumber(n, 2)} %`;

/** Whether the plan has anything the savings tax applies to. */
export function hasSavingsTax(s: CapitalTaxSummary): boolean {
  return s.accounts.some((t) => t.wrapper !== 'cash' || t.tax >= 1);
}

/** A compact line with this year's tax on savings; opens the breakdown. */
export function SavingsTaxStrip() {
  const m = useMetrics();
  const currency = useCurrency();
  const [open, setOpen] = useState(false);
  const t = useT().accounts.savingsTax;
  const s = m.capitalTax;
  if (!hasSavingsTax(s)) return null;
  const money = (n: number) => formatMoney(n, currency);
  const hasSchablon = s.accounts.some((t) => t.wrapper === 'isk' || t.wrapper === 'kf');

  return (
    <>
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <IconTile icon="account-investment" accent="purple" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-ink">
              {t.title(s.year.year)}
              {s.year.preliminary && <Chip tone="orange">{t.estimate}</Chip>}
            </div>
            <div className="tabular text-[20px] font-bold leading-tight text-ink">{money(s.total)}</div>
            <div className="text-[12px] text-muted">
              {hasSchablon
                ? t.taxFreeUsed(money(s.taxFreeUsed), money(s.year.taxFree))
                : s.unknownBalance > 0
                  ? t.pickWrappers
                  : t.interestDividendsFunds}
            </div>
          </div>
        </div>
        {hasSchablon && s.year.taxFree > 0 && (
          <ProgressBar value={s.taxFreeUsed / s.year.taxFree} accent="purple" className="sm:max-w-[160px]" />
        )}
        <Button variant="secondary" size="sm" iconRight={ArrowRight} onClick={() => setOpen(true)} className="self-start sm:self-center">
          {t.details}
        </Button>
      </Card>
      <SavingsTaxSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Opens the savings tax breakdown from anywhere, e.g. the tax line in upcoming expenses. */
export function useSavingsTaxSheet() {
  const [open, setOpen] = useState(false);
  return { open: () => setOpen(true), sheet: <SavingsTaxSheet open={open} onClose={() => setOpen(false)} /> };
}

export function SavingsTaxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useMetrics();
  const plan = useEffectivePlan();
  const now = useViewDate();
  const currency = useCurrency();
  const outlook = useRateOutlook();
  const t = useT().accounts.savingsTax;
  const s = m.capitalTax;
  const next = useMemo(
    () => (open ? capitalTaxSummary(plan, now, outlook.govBondRate, s.year.year + 1) : null),
    [open, plan, now, outlook.govBondRate, s.year.year],
  );
  const money = (n: number) => formatMoney(n, currency);
  const shown = s.accounts.filter((a) => a.wrapper !== 'cash' || a.tax >= 1);
  const gov = outlook.govBondRate;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.title(s.year.year)}
      subtitle={t.sheetSubtitle(percent(s.year.schablonRate), percent(s.year.slr), s.year.preliminary ? undefined : s.year.year - 1)}
    >
      <div className="space-y-5 text-[13px]">
        {s.accounts.some((a) => a.wrapper === 'isk' || a.wrapper === 'kf') && s.year.taxFree > 0 && (
          <div>
            <div className="mb-1 flex justify-between gap-3">
              <span className="text-ink-soft">{t.taxFreeLevel}</span>
              <span className="tabular text-ink">
                {money(s.taxFreeUsed)} / {money(s.year.taxFree)}
              </span>
            </div>
            <ProgressBar value={s.taxFreeUsed / s.year.taxFree} accent="purple" />
            <p className="mt-1 text-[11.5px] text-muted">
              {t.underlagExplained}
            </p>
          </div>
        )}

        <ul className="divide-y divide-line">
          {shown.map((a) => (
            <AccountTaxRow key={a.accountId} t={a} money={money} />
          ))}
        </ul>

        <dl className="divide-y divide-line border-t border-line">
          <Row label={t.takenDuringYear} hint={t.byBankOrInsurer} value={money(s.accounts.reduce((sum, a) => sum + a.withheld, 0))} />
          <Row
            label={s.slutskatt >= 0 ? t.addedToFinalTax : t.backInFinalTax}
            hint={t.finalTaxDue(s.year.year + 1)}
            value={money(Math.abs(s.slutskatt))}
          />
          <Row label={t.totalTax(s.year.year)} value={money(s.total)} strong />
          {s.taxIfSold >= 1 && <Row label={t.afTaxIfSold} hint={t.afTaxIfSoldHint} value={money(s.taxIfSold)} />}
        </dl>

        {s.slutskatt > 30_000 && (
          <p className="rounded-xl bg-page px-3 py-2 text-[12px] text-ink-soft">
            {t.finalTaxInterest}
          </p>
        )}

        {next && hasSavingsTax(next) && (
          <div className="rounded-xl bg-page px-3 py-2.5">
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">
                {t.nextYear(next.year.year, next.year.preliminary ? percent(next.year.slr) : undefined)}
              </span>
              <span className="tabular font-medium text-ink">{t.about(money(next.total))}</span>
            </div>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {next.year.preliminary
                ? t.nextYearPreliminary
                : t.nextYearLocked(percent(next.year.schablonRate))}
            </p>
          </div>
        )}

        <p className="text-[11.5px] text-muted">
          {t.footnote(gov ? formatDate(gov.date) : undefined)}
        </p>
      </div>
    </Sheet>
  );
}

function AccountTaxRow({ t, money }: { t: AccountTax; money: (n: number) => string }) {
  const msg = useT().accounts.savingsTax;
  let how: string;
  switch (t.wrapper) {
    case 'isk':
      how = msg.iskRow(money(t.underlag));
      break;
    case 'kf':
      how =
        t.withheld - t.tax >= 1
          ? msg.kfRowRefund(money(t.underlag), money(t.withheld), money(t.withheld - t.tax))
          : msg.kfRow(money(t.underlag));
      break;
    case 'af': {
      const parts = [msg.afFunds(money(t.underlag))];
      if (t.gain !== undefined && t.gain >= 0) parts.push(msg.afIfSold(money(t.taxIfSold)));
      if (t.gain !== undefined && t.gain < 0) parts.push(msg.afLoss(money(lossValue(-t.gain).againstGains)));
      how = parts.join(' · ');
      break;
    }
    case 'unknown':
      how = msg.unknownRow;
      break;
    default:
      how = msg.cashRow;
  }
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <span className="min-w-0 text-ink-soft">
        {t.name} <span className="text-[11.5px] text-faint">{accountKindMeta(t.kind).label}</span>
        <span className="block text-[11.5px] text-muted">{how}</span>
      </span>
      <span className="tabular shrink-0 text-right font-medium text-ink">{t.wrapper === 'unknown' ? '–' : money(t.tax)}</span>
    </li>
  );
}

function Row({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={strong ? 'font-semibold text-ink' : 'text-ink-soft'}>
        {label}
        {hint && <span className="block text-[11.5px] text-faint sm:ml-1.5 sm:inline">{hint}</span>}
      </dt>
      <dd className={`tabular shrink-0 ${strong ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{value}</dd>
    </div>
  );
}
