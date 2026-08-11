import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import TopBar from './TopBar';

export default function Layout() {
  return (
    // h-full (not h-screen): html/body/#root are already height:100%, which is
    // reliable under viewport-fit=cover where 100vh != the visible viewport.
    <div className="h-full flex bg-surface text-content">
      <Sidebar />
      {/* min-h-0 is load-bearing: a flex item defaults to min-height:auto and
          refuses to shrink below its content, which stops <main> from ever
          becoming the scroll container and makes the whole page scroll instead. */}
      <div className="app-shell flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar />
        <main className="app-scroll flex-1 overflow-y-auto">
          {/* pb-28 clears the floating tab bar so it never covers the last row. */}
          <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8 pb-28 md:pb-8 animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
