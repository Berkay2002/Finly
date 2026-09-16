import { useEffect, useState } from 'react';
import { usePlanStore } from '@/store/planStore';
import { usePlan } from '@/store/selectors';
import { TextField } from '@/components/ui/fields';
import { useT } from '@/i18n';

/**
 * The plan's birth year, asked once (onboarding, Settings, or the CSN loan sheet when missing) and reused
 * wherever age matters. Saved only once it is a whole year, so a half-typed "19" never reaches the plan.
 */
export function BirthYearField({ hint, className }: { hint?: string; className?: string }) {
  const t = useT();
  const plan = usePlan();
  const setBirthYear = usePlanStore((s) => s.setBirthYear);
  const [text, setText] = useState(plan.birthYear ? String(plan.birthYear) : '');

  useEffect(() => {
    setText(plan.birthYear ? String(plan.birthYear) : '');
  }, [plan.birthYear]);

  const thisYear = new Date().getFullYear();

  return (
    <TextField
      label={t.settings.birthYear.label}
      hint={hint ?? t.settings.birthYear.optional}
      className={className}
      type="number"
      inputMode="numeric"
      min={1900}
      max={thisYear}
      placeholder={t.settings.birthYear.placeholder}
      value={text}
      onChange={(e) => {
        const value = e.target.value;
        setText(value);
        const year = Number(value);
        if (value === '') setBirthYear(undefined);
        else if (/^\d{4}$/.test(value) && year >= 1900 && year <= thisYear) setBirthYear(year);
      }}
    />
  );
}
