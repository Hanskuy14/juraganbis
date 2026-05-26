import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { formatIDR } from '../utils/format';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'dealer', label: 'Dealer', icon: '🏪' },
  { id: 'garasi', label: 'Garasi', icon: '🚌' },
];

export default function Topbar({ activeTab, onTabChange }) {
  const { state, assignedCount, resetGame } = useGame();
  const [confirmReset, setConfirmReset] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-900/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Brand + PO name */}
        <div className="flex items-center justify-between gap-3 lg:justify-start">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 font-display text-lg font-extrabold text-ink-900 shadow-glass">
              R
            </div>
            <div className="leading-tight">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">
                Raja Pantura
              </div>
              <div className="font-display text-base font-bold text-white">
                {state.poName || 'PO Tanpa Nama'}
              </div>
            </div>
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="btn-ghost lg:hidden"
            aria-label="Menu"
          >
            <span className="text-xl leading-none">☰</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 lg:flex lg:items-center lg:gap-3">
          <Stat label="Hari" value={`Hari ke-${state.day}`} tone="sky" />
          <Stat
            label="Saldo"
            value={formatIDR(state.balance)}
            tone={state.balance < 0 ? 'rose' : 'emerald'}
            highlight
          />
          <Stat
            label="Armada"
            value={`${state.fleet.length} bus · ${assignedCount} aktif`}
            tone="amber"
          />
        </div>
      </div>

      {/* Tab nav (desktop) */}
      <nav className="hidden border-t border-white/5 lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-6">
          <div className="flex items-center gap-1">
            {TABS.map((t) => (
              <TabButton
                key={t.id}
                active={activeTab === t.id}
                onClick={() => onTabChange(t.id)}
                icon={t.icon}
                label={t.label}
              />
            ))}
          </div>
          <ResetControl
            confirmReset={confirmReset}
            setConfirmReset={setConfirmReset}
            resetGame={resetGame}
          />
        </div>
      </nav>

      {/* Tab nav (mobile drawer) */}
      {menuOpen && (
        <nav className="border-t border-white/5 px-4 py-3 lg:hidden">
          <div className="grid grid-cols-3 gap-2">
            {TABS.map((t) => (
              <TabButton
                key={t.id}
                active={activeTab === t.id}
                onClick={() => {
                  onTabChange(t.id);
                  setMenuOpen(false);
                }}
                icon={t.icon}
                label={t.label}
                stacked
              />
            ))}
          </div>
          <div className="mt-3">
            <ResetControl
              confirmReset={confirmReset}
              setConfirmReset={setConfirmReset}
              resetGame={resetGame}
              fullWidth
            />
          </div>
        </nav>
      )}
    </header>
  );
}

function Stat({ label, value, tone = 'sky', highlight = false }) {
  const tones = {
    sky: 'text-sky-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
  };
  return (
    <div
      className={`glass-card flex min-w-[7rem] flex-col px-3 py-2 lg:px-4 ${
        highlight ? 'ring-1 ring-amber-400/20' : ''
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
        {label}
      </span>
      <span className={`truncate text-sm font-bold lg:text-base ${tones[tone]}`}>
        {value}
      </span>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, stacked = false }) {
  if (stacked) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
          active
            ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
            : 'border-white/5 bg-white/[0.02] text-white/60 hover:bg-white/5'
        }`}
      >
        <span className="text-lg">{icon}</span>
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors ${
        active ? 'text-amber-300' : 'text-white/60 hover:text-white'
      }`}
    >
      <span>{icon}</span>
      {label}
      {active && (
        <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-amber-400" />
      )}
    </button>
  );
}

function ResetControl({ confirmReset, setConfirmReset, resetGame, fullWidth = false }) {
  if (!confirmReset) {
    return (
      <button
        type="button"
        onClick={() => setConfirmReset(true)}
        className={`btn-ghost text-xs ${fullWidth ? 'w-full' : ''}`}
      >
        ⟲ Reset Game
      </button>
    );
  }
  return (
    <div className={`flex items-center gap-2 ${fullWidth ? 'w-full' : ''}`}>
      <span className="text-xs text-white/60">Hapus save?</span>
      <button
        type="button"
        onClick={() => setConfirmReset(false)}
        className="btn-ghost text-xs"
      >
        Batal
      </button>
      <button
        type="button"
        onClick={() => {
          resetGame();
          setConfirmReset(false);
        }}
        className="btn-danger text-xs"
      >
        Ya, hapus
      </button>
    </div>
  );
}
