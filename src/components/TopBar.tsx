import { useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/bills': 'Bills',
  '/expenses': 'Expenses',
  '/paychecks': 'Paychecks',
  '/goals': 'Savings Goals',
  '/registered': 'Registered Accounts',
  '/payoff': 'Payoff',
  '/calendar': 'Calendar',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

export default function TopBar() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'Dashboard';

  const today = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <header className="h-16 px-8 border-b border-border bg-surface flex items-center justify-between">
      <div>
        <h1 className="text-xl font-display font-semibold tracking-tight">{title}</h1>
        <div className="text-xs text-content-subtle">{today}</div>
      </div>
      <ThemeToggle />
    </header>
  );
}
