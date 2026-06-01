import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Bills from './pages/Bills';
import Expenses from './pages/Expenses';
import Paychecks from './pages/Paychecks';
import Goals from './pages/Goals';
import CalendarView from './pages/Calendar';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/paychecks" element={<Paychecks />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
