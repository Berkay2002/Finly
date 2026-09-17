import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { EXPENSE_CATEGORIES } from '@/engine/types';
import { CATEGORY_ROUTE } from '@/nav';
import { AccountDetailPage } from '@/pages/AccountDetailPage';
import { AccountsPage } from '@/pages/AccountsPage';
import { LoansPage } from '@/pages/LoansPage';
import { Dashboard } from '@/pages/Dashboard';
import { ExpenseSectionPage } from '@/pages/ExpenseSectionPage';
import { IncomePage } from '@/pages/IncomePage';
import { InsightsPage } from '@/pages/InsightsPage';
import { PlanningPage } from '@/pages/PlanningPage';
import { SavingsPage } from '@/pages/SavingsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { Welcome } from '@/pages/Welcome';
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage';
import { ThemeController } from '@/store/themeStore';

export default function App() {
  return (
    <>
      <ThemeController />
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="onboarding" element={<Navigate to="/onboarding/income" replace />} />
          <Route path="onboarding/:step" element={<OnboardingPage />} />
          <Route path="income" element={<IncomePage />} />
          {EXPENSE_CATEGORIES.map((c) => (
            <Route key={c} path={CATEGORY_ROUTE[c].slice(1)} element={<ExpenseSectionPage category={c} />} />
          ))}
          <Route path="savings" element={<SavingsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="accounts/:id" element={<AccountDetailPage />} />
          <Route path="loans" element={<LoansPage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
