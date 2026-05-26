import { useGame } from '../context/GameContext';
import { formatIDR, formatNumber } from '../utils/format';

// Renders the end-game overlay. Two outcomes:
//   - "pailit": balance was negative for 5 days straight.
//   - "champion": the player hit Rank #1 with reputation >= 950.
export default function GameOverModal() {
  const { state, ranking, resetGame } = useGame();
  const over = state.gameOver;
  if (!over) return null;

  const isWin = over.reason === 'champion';
  const playerEntry = ranking.find((e) => e.isPlayer);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div
        className={`glass-panel relative w-full max-w-2xl overflow-hidden ${
          isWin ? 'ring-2 ring-amber-400/60' : 'ring-2 ring-rose-400/40'
        }`}
      >
        <div
          className={`relative overflow-hidden p-6 sm:p-8 ${
            isWin
              ? 'bg-gradient-to-br from-amber-500/30 via-amber-500/10 to-transparent'
              : 'bg-gradient-to-br from-rose-500/30 via-rose-500/10 to-transparent'
          }`}
        >
          <div className="text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-black/40 text-4xl">
              {isWin ? '👑' : '💀'}
            </div>
            <span
              className={`pill mt-4 ${
                isWin
                  ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                  : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
              }`}
            >
              {isWin ? 'Tamat — Kemenangan' : 'Tamat — Pailit'}
            </span>
            <h1 className="mt-3 font-display text-3xl font-extrabold text-white sm:text-4xl">
              {isWin ? `Selamat, ${state.poName}!` : 'Bisnis Gulung Tikar'}
            </h1>
            <p className="mt-2 max-w-md mx-auto text-sm text-white/70">
              {isWin
                ? 'PO-mu resmi jadi raksasa transportasi Pulau Jawa. Reputasi tertinggi, armada paling diperhitungkan, kamu adalah Raja Pantura sejati.'
                : `Kas PO minus ${formatIDR(Math.abs(over.finalBalance))} selama ${state.daysInDebt} hari berturut-turut. Bank menarik aset & operasi dihentikan.`}
            </p>
          </div>
        </div>

        <div className="border-t border-white/10 p-5 sm:p-6">
          <h3 className="font-display text-sm font-bold text-white">📊 Statistik Akhir</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Hari bertahan" value={`${over.day - 1} hari`} tone="text-sky-300" />
            <Stat
              label="Saldo akhir"
              value={formatIDR(over.finalBalance)}
              tone={over.finalBalance < 0 ? 'text-rose-300' : 'text-emerald-300'}
            />
            <Stat
              label="Reputasi"
              value={`${formatNumber(over.finalReputation)} / 1000`}
              tone="text-amber-300"
            />
            <Stat
              label="Armada"
              value={`${over.finalFleetSize} bus`}
              tone="text-white"
            />
          </div>

          {playerEntry && (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 ${
                isWin
                  ? 'border-amber-400/30 bg-amber-500/10'
                  : 'border-white/10 bg-black/25'
              }`}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">Posisi akhir di leaderboard</span>
                <span className="font-display text-base font-bold text-white">
                  Rank #{playerEntry.rank} dari {ranking.length}
                </span>
              </div>
            </div>
          )}

          {!isWin && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-white/60">
              <li>BBM, gaji kru, dan cicilan bank terus berjalan tiap berangkat.</li>
              <li>Hindari pinjaman besar tanpa armada cukup untuk membayar.</li>
              <li>Servis berkala bus untuk hindari mogok yang mahal.</li>
            </ul>
          )}
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/10 bg-black/30 p-4 sm:flex-row sm:justify-end">
          <button onClick={resetGame} className="btn-primary">
            🚌 Mulai PO Baru
          </button>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={`mt-0.5 font-display text-base font-bold ${tone}`}>{value}</div>
    </div>
  );
}
