import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useTheme } from '@/lib/theme';
import Payoff from '@/pages/Payoff';
import Registered from '@/pages/Registered';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import { RefreshProvider } from './data';
import PhoneLayout from './PhoneLayout';
import BudgetScreen from './budget/BudgetScreen';
import CategoryDetail from './budget/CategoryDetail';
import ExpensesScreen from './expenses/ExpensesScreen';
import WeeklyReport from './expenses/WeeklyReport';
import FundDetail from './funds/FundDetail';
import MoreScreen from './more/MoreScreen';
import PayHistory from './more/PayHistory';
import ExportPanel from './onboarding/ExportPanel';
import PhoneOnboarding from './onboarding/PhoneOnboarding';
import SetupFlow from './onboarding/SetupFlow';
import RecurringScreen from './recurring/RecurringScreen';
import { NavHeader } from './ui/kit';
import ThemeButton from './ui/ThemeButton';

/** An existing desktop page inside the phone shell, under a back-button header. */
function Subpage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <NavHeader title={title} />
      <div className="pt-2">{children}</div>
    </div>
  );
}

function Setup() {
  const navigate = useNavigate();
  return <SetupFlow onDone={() => navigate('/', { replace: true })} onExit={() => navigate(-1)} />;
}

/**
 * The iPhone app (and any phone-width window): a monthly budget with
 * Budget / Expenses / More tabs. Desktop keeps its own routes in App.tsx.
 */
export default function PhoneApp() {
  const { onboarded } = useTheme();

  return (
    <RefreshProvider>
      <ThemeButton />
      {!onboarded ? (
        <PhoneOnboarding />
      ) : (
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route element={<PhoneLayout />}>
            <Route path="/" element={<BudgetScreen />} />
            <Route path="/category/:id" element={<CategoryDetail />} />
            <Route path="/fund/:id" element={<FundDetail />} />
            <Route path="/expenses" element={<ExpensesScreen />} />
            <Route path="/expenses/week" element={<WeeklyReport />} />
            <Route path="/expenses/week/:start" element={<WeeklyReport />} />
            <Route path="/recurring" element={<RecurringScreen />} />
            <Route path="/more" element={<MoreScreen />} />
            <Route path="/pay-history" element={<PayHistory />} />
            <Route path="/export" element={<Subpage title="Get advice from your AI"><ExportPanel /></Subpage>} />
            <Route path="/payoff" element={<Subpage title="Payoff"><Payoff /></Subpage>} />
            <Route path="/registered" element={<Subpage title="Registered accounts"><Registered /></Subpage>} />
            <Route path="/reports" element={<Subpage title="Reports"><Reports /></Subpage>} />
            <Route path="/settings" element={<Subpage title="Settings"><Settings /></Subpage>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </RefreshProvider>
  );
}
