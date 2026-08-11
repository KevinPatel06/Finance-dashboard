import { useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { useIsMobile } from '@/lib/useIsMobile';

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
  const isMobile = useIsMobile();
  const title = titles[pathname] ?? 'Dashboard';

  // On the phone home screen the greeting header inside MobileDashboard takes
  // over — a title bar saying "Dashboard" above it would just be noise.
  if (isMobile && pathname === '/') return null;

  const today = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <header className="app-topbar h-14 md:h-16 px-4 md:px-8 border-b border-border bg-surface flex items-center justify-between box-content">
      <div>
        <h1 className="text-lg md:text-xl font-display font-semibold tracking-tight">{title}</h1>
        {/* The date is desktop chrome; on a phone the row should stay compact. */}
        <div className="hidden md:block text-xs text-content-subtle">{today}</div>
      </div>
      <ThemeToggle />
    </header>
  );
}
