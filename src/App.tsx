import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Bills from './pages/Bills';
import Expenses from './pages/Expenses';
import Paychecks from './pages/Paychecks';
import Goals from './pages/Goals';
import Registered from './pages/Registered';
import Payoff from './pages/Payoff';
import CalendarView from './pages/Calendar';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Welcome from './pages/Welcome';
import { useTheme } from './lib/theme';

export default function App() {
  const { ready, onboarded } = useTheme();

  // Hold the first paint until settings load — otherwise the app flashes the
  // default theme, and a fresh install would flash the dashboard before the
  // welcome flow replaces it. This is a local SQLite read, so it's imperceptible.
  if (!ready) return null;

  if (!onboarded) return <Welcome />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/paychecks" element={<Paychecks />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/registered" element={<Registered />} />
        <Route path="/payoff" element={<Payoff />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
