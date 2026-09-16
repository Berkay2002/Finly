import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { usePlanStore } from "@/store/planStore";

export function Welcome() {
  const navigate = useNavigate();
  const loadSample = usePlanStore((s) => s.loadSample);
  const startOnboarding = usePlanStore((s) => s.startOnboarding);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-10" to="/welcome" />
      <div className="w-full max-w-xl text-center">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink sm:text-[40px]">
          Understand what your life actually costs.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">
          Finly turns your income, bills, savings and balances into one clear
          picture: how much you can safely spend, how much you are saving, and
          how resilient you are.
        </p>
      </div>

      <div className="mt-10 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            startOnboarding();
            navigate("/onboarding/income");
          }}
          className="card flex items-start gap-4 p-5 text-left transition hover:border-brand-200"
        >
          <Icon icon="welcome-plan" size={72} className="-my-1 -ml-1" />
          <div className="flex min-w-0 flex-1 flex-col gap-3 self-stretch">
            <div>
              <div className="text-[16px] font-semibold text-ink">
                Plan my finances
              </div>
              <div className="mt-1 text-[13px] text-muted">
                A guided session in ten short steps. Skip anything that does not
                apply to you.
              </div>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium text-brand-700">
              Start planning <ArrowRight size={14} />
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            loadSample();
            navigate("/");
          }}
          className="card flex items-start gap-4 p-5 text-left transition hover:border-brand-200"
        >
          <Icon icon="welcome-explore" size={72} className="-my-1 -ml-1" />
          <div className="flex min-w-0 flex-1 flex-col gap-3 self-stretch">
            <div>
              <div className="text-[16px] font-semibold text-ink">
                Explore with sample data
              </div>
              <div className="mt-1 text-[13px] text-muted">
                See the full dashboard with an example plan. You can edit
                everything or reset it later.
              </div>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium text-purple-500">
              Open the demo <ArrowRight size={14} />
            </span>
          </div>
        </button>
      </div>

      <div className="mt-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          Skip for now
        </Button>
      </div>
      <p className="mt-6 max-w-sm text-center text-[12px] text-faint">
        Everything stays in this browser unless you turn on sync, and even then it is encrypted before it leaves.
      </p>
    </div>
  );
}
