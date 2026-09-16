import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { useT } from "@/i18n";
import { usePlanStore } from "@/store/planStore";

export function Welcome() {
  const navigate = useNavigate();
  const loadSample = usePlanStore((s) => s.loadSample);
  const startOnboarding = usePlanStore((s) => s.startOnboarding);
  const t = useT();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <LanguageSwitch variant="compact" className="absolute right-4 top-4" />
      <Logo className="mb-10" to="/welcome" />
      <div className="w-full max-w-xl text-center">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink sm:text-[40px]">
          {t.welcome.headline}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">
          {t.welcome.intro}
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
                {t.welcome.plan.title}
              </div>
              <div className="mt-1 text-[13px] text-muted">
                {t.welcome.plan.description}
              </div>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium text-brand-700">
              {t.welcome.plan.cta} <ArrowRight size={14} />
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
                {t.welcome.demo.title}
              </div>
              <div className="mt-1 text-[13px] text-muted">
                {t.welcome.demo.description}
              </div>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium text-purple-500">
              {t.welcome.demo.cta} <ArrowRight size={14} />
            </span>
          </div>
        </button>
      </div>

      <div className="mt-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          {t.welcome.skip}
        </Button>
      </div>
      <p className="mt-6 max-w-sm text-center text-[12px] text-faint">
        {t.welcome.privacy}
      </p>
    </div>
  );
}
