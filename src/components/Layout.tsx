import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import TopBar from './TopBar';

export default function Layout() {
  return (
    <div className="h-screen flex bg-surface text-content">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {/* pb-24 keeps the bottom tab bar from covering the last row. */}
          <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8 pb-24 md:pb-8 animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
