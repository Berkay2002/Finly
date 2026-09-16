import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { STEP_META } from '@/engine/taxonomy';
import { ONBOARDING_STEPS, type OnboardingStep } from '@/engine/types';
import { STEP_ICON } from '@/components/ui/icons';
import { Icon } from '@/components/ui/Icon';

export function DesktopStepper({ current, completed }: { current: OnboardingStep; completed: OnboardingStep[] }) {
  const idx = ONBOARDING_STEPS.indexOf(current);
  return (
    <ol className="hidden items-start md:flex">
      {ONBOARDING_STEPS.map((step, i) => {
        const done = completed.includes(step) && i !== idx;
        const active = i === idx;
        return (
          <li key={step} className={clsx('relative flex flex-col items-center', i < ONBOARDING_STEPS.length - 1 && 'flex-1')}>
            {i < ONBOARDING_STEPS.length - 1 && (
              <span
                className={clsx(
                  'absolute left-1/2 top-[15px] h-0.5 w-full',
                  i < idx || done ? 'bg-brand-500' : 'bg-line',
                )}
              />
            )}
            <Link
              to={`/onboarding/${step}`}
              className={clsx(
                'relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 text-[12.5px] font-semibold transition',
                active
                  ? 'border-brand-solid bg-brand-solid text-white'
                  : done
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-line bg-card text-muted hover:border-line-strong',
              )}
            >
              {done ? <Check size={14} /> : i + 1}
            </Link>
            <span
              className={clsx(
                'mt-1.5 max-w-[110px] text-center text-[11.5px] font-medium leading-tight',
                active ? 'text-brand-700' : 'text-muted',
              )}
            >
              {STEP_META[step].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function MobileStepper({ current }: { current: OnboardingStep }) {
  return (
    <div className="grid grid-cols-5 gap-y-3 md:hidden">
      {ONBOARDING_STEPS.map((step) => {
        const active = step === current;
        return (
          <Link key={step} to={`/onboarding/${step}`} className="flex flex-col items-center gap-1.5">
            <span className="inline-flex h-11 w-11 items-center justify-center">
              <Icon
                icon={STEP_ICON[step]}
                size={19}
                pictureScale={2}
                className={clsx('transition', active ? 'scale-110' : 'opacity-60 grayscale-[35%]')}
              />
            </span>
            <span
              className={clsx(
                'text-center text-[10.5px] font-medium leading-tight',
                active ? 'text-brand-700' : 'text-muted',
              )}
            >
              {STEP_META[step].shortLabel}
            </span>
            <span className={clsx('h-1 w-1 rounded-full', active ? 'bg-brand-solid' : 'bg-transparent')} />
          </Link>
        );
      })}
    </div>
  );
}

export function StepDots({ current }: { current: OnboardingStep }) {
  const idx = ONBOARDING_STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-1">
      {ONBOARDING_STEPS.map((s, i) => (
        <span key={s} className={clsx('h-1.5 rounded-full', i === idx ? 'w-4 bg-brand-solid' : 'w-1.5 bg-line-strong')} />
      ))}
    </div>
  );
}
