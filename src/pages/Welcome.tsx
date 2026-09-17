import { useMemo } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Logo } from '@/components/layout/Logo';
import { ThemeToggleButton } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { LanguageSwitch } from '@/components/ui/LanguageSwitch';
import type { PictureName } from '@/components/ui/pictures';
import { formatMoney, formatMoneyRange, formatMonthYear } from '@/engine/format';
import { computeMetrics } from '@/engine/metrics';
import { useLanguage, useT } from '@/i18n';
import { samplePlan } from '@/store/sampleData';
import { usePlanStore } from '@/store/planStore';

const FEATURE_ICONS: PictureName[] = ['stat-safe-to-spend', 'card-upcoming', 'card-income-change'];

export function Welcome() {
  const navigate = useNavigate();
  const loadSample = usePlanStore((s) => s.loadSample);
  const startOnboarding = usePlanStore((s) => s.startOnboarding);
  const t = useT();
  const w = t.welcome;

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo to="/welcome" />
        <div className="flex items-center gap-2">
          <LanguageSwitch variant="compact" />
          <ThemeToggleButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="grid items-center gap-10 pt-6 sm:pt-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:pt-16">
          <section>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 py-1 pl-1.5 pr-3 text-[12.5px] font-medium text-brand-700">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-solid">
                <Icon icon="logo-mark-white" size={12} />
              </span>
              {w.eyebrow}
            </span>
            <h1 className="mt-5 text-[36px] font-bold leading-[1.08] tracking-tight text-ink sm:text-[48px] lg:text-[54px]">
              {w.headline}
            </h1>
            <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-muted sm:text-[17px]">{w.intro}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                iconRight={ArrowRight}
                onClick={() => {
                  startOnboarding();
                  navigate('/onboarding/income');
                }}
              >
                {w.plan.cta}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  loadSample();
                  navigate('/');
                }}
              >
                {w.demo.cta}
              </Button>
            </div>

            <p className="mt-6 flex max-w-md items-start gap-2 text-[12.5px] leading-snug text-faint">
              <Lock size={14} className="mt-0.5 shrink-0" />
              {w.privacy}
            </p>
          </section>

          <Preview />
        </div>

        <section className="mt-16 grid gap-4 sm:grid-cols-3 lg:mt-24">
          {w.features.map((f, i) => (
            <div key={f.title} className="card p-5">
              <Icon icon={FEATURE_ICONS[i]} size={44} className="-ml-1" />
              <div className="mt-3 text-[15px] font-semibold text-ink">{f.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </section>

        <div className="mt-10 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            {w.skip}
          </Button>
        </div>
      </main>
    </div>
  );
}

/**
 * The dashboard's headline numbers for the sample plan, so the page shows the product instead of
 * describing it. Computed on the fly: nothing is loaded into the store until the visitor chooses.
 */
function Preview() {
  const t = useT();
  const w = t.welcome.preview;
  const language = useLanguage();
  const { m, currency, month } = useMemo(() => {
    const now = new Date();
    const plan = samplePlan(now);
    return { m: computeMetrics(plan, now), currency: plan.currency, month: formatMonthYear(now) };
  }, [language]); // samplePlan reads the current language for its names.
  const money = (n: number) => formatMoney(n, currency);

  const income = Math.max(m.income.total, 1);
  const essential = m.essentialCost;
  const optional = Math.max(m.lifestyleCost - m.essentialCost, 0);
  const saving = m.savings.total;
  const left = Math.max(income - essential - optional - saving, 0);
  const segments = [
    { key: 'essential', value: essential, className: 'bg-brand-solid', label: w.legend.essential },
    { key: 'optional', value: optional, className: 'bg-orange-500', label: w.legend.optional },
    { key: 'saving', value: saving, className: 'bg-purple-500', label: w.legend.saving },
    { key: 'left', value: left, className: 'bg-line-strong', label: w.legend.left },
  ];

  return (
    <section aria-label={w.caption} className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -inset-y-10 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_45%,var(--color-brand-100),transparent_75%)]"
      />
      <div className="card shadow-island p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-page px-2.5 py-1 text-[11.5px] font-medium text-muted">{w.caption}</span>
          <span className="text-[12.5px] text-faint">{month}</span>
        </div>

        <div className="mt-5 flex items-start gap-4">
          <Icon icon="stat-safe-to-spend" size={52} className="-ml-1 -mt-1" />
          <div className="min-w-0">
            <div className="text-[13px] text-muted">{w.safeToSpend}</div>
            <div className="tabular mt-0.5 text-[34px] font-bold leading-none tracking-tight text-ink sm:text-[38px]">
              {money(m.safeToSpend)}
            </div>
            {m.range.hasRanges && (
              <div className="mt-2 text-[12.5px] text-muted">
                {w.usually(formatMoneyRange(m.range.safeToSpend.low, m.range.safeToSpend.high, currency))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
            {segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <div key={s.key} className={clsx('h-full', s.className)} style={{ width: `${(s.value / income) * 100}%` }} />
              ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            {segments.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className={clsx('h-2 w-2 rounded-full', s.className)} />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-line pt-5">
          <Mini icon="stat-income" label={w.income} value={money(m.income.total)} />
          <Mini icon="stat-cost" label={w.cost} value={money(m.lifestyleCost)} />
          <Mini icon="stat-saving" label={w.saving} value={money(m.savings.total)} />
        </div>
      </div>
    </section>
  );
}

function Mini({ icon, label, value }: { icon: PictureName; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Icon icon={icon} size={30} className="-ml-0.5" />
      <div className="mt-1.5 truncate text-[11.5px] text-muted">{label}</div>
      <div className="tabular truncate text-[14px] font-semibold text-ink">{value}</div>
    </div>
  );
}
