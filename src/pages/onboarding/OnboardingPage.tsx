import { ArrowLeft, ArrowRight, Check, Lightbulb } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { STEP_META } from '@/engine/taxonomy';
import { ONBOARDING_STEPS, type OnboardingStep } from '@/engine/types';
import { usePlanStore } from '@/store/planStore';
import { usePlan } from '@/store/selectors';
import { AccountEditor } from '@/components/forms/AccountEditor';
import { ExpenseEditor } from '@/components/forms/ExpenseEditor';
import { LoanEditor } from '@/components/forms/LoanEditor';
import { GoalEditor } from '@/components/forms/GoalEditor';
import { HomeFields } from '@/components/forms/HomeFields';
import { IncomeEditor } from '@/components/forms/IncomeEditor';
import { MonthSelector, Avatar, NotificationsButton } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { STEP_ICON } from '@/components/ui/icons';
import { IconTile } from '@/components/ui/IconTile';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LiveSummary } from './LiveSummary';
import { DesktopStepper, MobileStepper, StepDots } from './Stepper';
import { SummaryStep } from './SummaryStep';

function isStep(s: string | undefined): s is OnboardingStep {
  return !!s && (ONBOARDING_STEPS as string[]).includes(s);
}

export function OnboardingPage() {
  const { step } = useParams();
  const navigate = useNavigate();
  const plan = usePlan();
  const { completeStep, finishOnboarding } = usePlanStore();

  if (!isStep(step)) return <Navigate to="/onboarding/income" replace />;

  const idx = ONBOARDING_STEPS.indexOf(step);
  const prev = idx > 0 ? ONBOARDING_STEPS[idx - 1] : null;
  const next = idx < ONBOARDING_STEPS.length - 1 ? ONBOARDING_STEPS[idx + 1] : null;
  const meta = STEP_META[step];
  const isSummary = step === 'summary';
  const completedCount = plan.onboarding.completedSteps.filter((s) => s !== 'summary').length;

  const continueTo = () => {
    completeStep(step);
    if (next) navigate(`/onboarding/${next}`);
    else {
      finishOnboarding();
      navigate('/');
    }
  };

  const skip = () => {
    if (next) navigate(`/onboarding/${next}`);
    else navigate('/');
  };

  const content = (() => {
    if (step === 'income')
      return (
        <div className="space-y-6">
          <div className="rounded-xl border border-line bg-page/60 p-3 sm:p-4">
            <h3 className="text-[15px] font-semibold text-ink">Where do you live?</h3>
            <p className="mb-3 mt-0.5 text-[12.5px] text-muted">
              Needed for things like your net salary and electricity costs.
            </p>
            <HomeFields />
          </div>
          <IncomeEditor />
        </div>
      );
    if (step === 'savings') return <GoalEditor />;
    if (step === 'accounts') return <AccountEditor />;
    if (step === 'summary') return <SummaryStep />;
    if (step === 'finance')
      return (
        <div className="space-y-6">
          <div>
            <h3 className="mb-1 text-[14px] font-semibold text-ink">Loans</h3>
            <p className="mb-3 text-[12.5px] text-muted">
              CSN, bolån, billån and credit. Payments count as essential costs; the balance and rate show what the debt really
              costs you.
            </p>
            <LoanEditor />
          </div>
          <div>
            <h3 className="mb-3 text-[14px] font-semibold text-ink">Banking and insurance</h3>
            <ExpenseEditor category={meta.category!} />
          </div>
        </div>
      );
    return <ExpenseEditor category={meta.category!} />;
  })();

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink sm:text-[26px]">
            Let's plan your financial life
          </h1>
          <p className="mt-1 text-[14px] text-muted">A few simple steps to get a clear picture and a personalised plan.</p>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <MonthSelector />
          <NotificationsButton />
          <Avatar />
        </div>
        <Link to="/" className="shrink-0 whitespace-nowrap text-[13px] font-medium text-brand-700 underline-offset-2 hover:underline lg:hidden">
          Skip for now
        </Link>
      </div>

      {/* Steppers */}
      <div className="mb-3 flex items-center justify-between md:hidden">
        <span className="text-[12.5px] font-medium text-ink-soft">
          Step {idx + 1} of {ONBOARDING_STEPS.length}
        </span>
        <StepDots current={step} />
      </div>
      <div className="mb-6">
        <DesktopStepper current={step} completed={plan.onboarding.completedSteps} />
        <MobileStepper current={step} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="card p-4 sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <IconTile icon={STEP_ICON[step]} accent="brand" size="lg" className="hidden sm:inline-flex" />
                <div>
                  <h2 className="text-[20px] font-semibold leading-tight text-ink">{meta.title}</h2>
                  <p className="mt-1 max-w-xl text-[13.5px] text-muted">{meta.description}</p>
                </div>
              </div>
              {!isSummary && (
                <div className="flex shrink-0 items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 text-[12px] text-brand-800 sm:max-w-[220px]">
                  <Lightbulb size={14} className="mt-0.5 shrink-0" />
                  <span>Be as accurate as you can. You can always update this later.</span>
                </div>
              )}
            </div>
            {content}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            {prev ? (
              <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(`/onboarding/${prev}`)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {!isSummary && (
                <button type="button" onClick={skip} className="text-[13px] font-medium text-muted hover:text-ink">
                  I'll add this later
                </button>
              )}
              <Button size="lg" iconRight={isSummary ? Check : ArrowRight} onClick={continueTo}>
                {isSummary ? 'Confirm plan & open dashboard' : `Continue to ${STEP_META[next!].shortLabel}`}
              </Button>
            </div>
          </div>

          <div className="card mt-4 flex items-center gap-3 p-4 xl:hidden">
            <IconTile icon="card-goals" accent="brand" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-ink">Your planning progress</span>
                <span className="text-muted">
                  {completedCount} of {ONBOARDING_STEPS.length - 1}
                </span>
              </div>
              <ProgressBar value={completedCount / (ONBOARDING_STEPS.length - 1)} className="mt-1.5" />
              <div className="mt-1 text-[12px] text-muted">You're on your way to a clearer tomorrow.</div>
            </div>
          </div>
        </div>

        <LiveSummary className="hidden self-start xl:block xl:sticky xl:top-6" />
      </div>
    </div>
  );
}
