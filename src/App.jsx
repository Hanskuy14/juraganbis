import { useState } from 'react';
import { useGame } from './context/GameContext';
import MainMenu from './components/MainMenu';
import Topbar from './components/Topbar';
import Dashboard from './components/Dashboard';
import Dealer from './components/Dealer';
import Garasi from './components/Garasi';
import KantorPusat from './components/KantorPusat';
import Bengkel from './components/Bengkel';
import Bank from './components/Bank';
import Aset from './components/Aset';
import Leaderboard from './components/Leaderboard';
import DailyReportModal from './components/DailyReportModal';
import RoadEventModal from './components/RoadEventModal';
import GameOverModal from './components/GameOverModal';

export default function App() {
  const { hydrated, isGameStarted } = useGame();
  const [activeTab, setActiveTab] = useState('dashboard');

  // While we're checking localStorage, show a tiny placeholder. Avoids the
  // "main menu flashes for 1 frame even though a save exists" feeling.
  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-900 bg-aurora">
        <div className="flex items-center gap-3 text-white/60">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Memuat data PO...
        </div>
      </div>
    );
  }

  if (!isGameStarted) {
    return <MainMenu />;
  }

  return (
    <div className="relative min-h-screen bg-ink-900 bg-aurora">
      <Topbar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === 'dashboard' && <Dashboard onTabChange={setActiveTab} />}
        {activeTab === 'dealer' && <Dealer onTabChange={setActiveTab} />}
        {activeTab === 'garasi' && <Garasi onTabChange={setActiveTab} />}
        {activeTab === 'hr' && <KantorPusat onTabChange={setActiveTab} />}
        {activeTab === 'bengkel' && <Bengkel onTabChange={setActiveTab} />}
        {activeTab === 'bank' && <Bank onTabChange={setActiveTab} />}
        {activeTab === 'aset' && <Aset onTabChange={setActiveTab} />}
        {activeTab === 'leaderboard' && <Leaderboard onTabChange={setActiveTab} />}
      </main>

      <footer className="mx-auto max-w-7xl px-6 pb-10 pt-2 text-center text-[11px] text-white/30">
        Raja Pantura · Tycoon Bus Malam · Phase 3 Build · Save tersimpan otomatis di browser ini.
      </footer>

      {/* Global modals overlay any tab. Order matters: GameOver sits ABOVE
          the daily report (z-60 vs z-50). The event modal resolves first
          on dispatch, then the report renders. */}
      <RoadEventModal />
      <DailyReportModal />
      <GameOverModal />
    </div>
  );
}
