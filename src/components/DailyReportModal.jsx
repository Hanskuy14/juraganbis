import { useGame } from '../context/GameContext';
import { PRICING_STRATEGIES } from '../data/busTypes';
import { formatIDR, formatNumber, formatPercent } from '../utils/format';

export default function DailyReportModal() {
  const { state, clearReport } = useGame();
  const report = state.lastReport;
  if (!report) return null;

  const { day, rows, totals } = report;
  const dispatchedRows = rows.filter((r) => !r.idle);
  const idleRows = rows.filter((r) => r.idle);
  const profitable = totals.profit >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="glass-panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
        <header
          className={`relative overflow-hidden border-b border-white/10 p-5 ${
            profitable
              ? 'bg-gradient-to-br from-emerald-500/15 via-transparent to-amber-500/10'
              : 'bg-gradient-to-br from-rose-500/15 via-transparent to-amber-500/10'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span
                className={`pill ${
                  profitable
                    ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                    : 'border-rose-400/30 bg-rose-500/15 text-rose-200'
                }`}
              >
                Laporan Harian · Hari ke-{day}
              </span>
              <h3 className="mt-2 font-display text-xl font-extrabold text-white sm:text-2xl">
                {profitable ? 'Cuan malam ini! 🎉' : 'Tekor malam ini... 😓'}
              </h3>
              <p className="mt-1 text-sm text-white/60">
                {totals.dispatched} bus berangkat · {totals.idle} bus istirahat
              </p>
            </div>
            <button
              onClick={clearReport}
              className="btn-ghost text-sm"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Summary label="Pendapatan" value={formatIDR(totals.revenue)} tone="emerald" />
            <Summary label="Biaya BBM" value={formatIDR(totals.fuelCost)} tone="rose" />
            <Summary
              label="Profit Bersih"
              value={formatIDR(totals.profit)}
              tone={profitable ? 'amber' : 'rose'}
              big
            />
            <Summary
              label="Total Penumpang"
              value={`${formatNumber(totals.passengers)} org`}
              tone="sky"
            />
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {dispatchedRows.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/55">
                Detail per bus berangkat
              </h4>
              <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                {dispatchedRows.map((row) => (
                  <ReportRow key={row.busId} row={row} />
                ))}
              </div>
            </section>
          )}

          {idleRows.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/55">
                Bus tidak berangkat ({idleRows.length})
              </h4>
              <div className="space-y-1.5">
                {idleRows.map((row) => (
                  <div
                    key={row.busId}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-black/15 px-3 py-2 text-sm"
                  >
                    <span className="text-white/75">{row.busName}</span>
                    <span className="pill border-white/10 bg-white/5 text-white/50">
                      Belum ada trayek
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {dispatchedRows.length === 0 && idleRows.length === 0 && (
            <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-white/55">
              Belum ada bus di garasi. Beli unit pertama dulu, ya.
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/20 p-4">
          <p className="text-[11px] text-white/50">
            Hari {day} → Hari {day + 1}. Saldo otomatis disesuaikan.
          </p>
          <button onClick={clearReport} className="btn-primary">
            Lanjutkan ke hari berikutnya
          </button>
        </footer>
      </div>
    </div>
  );
}

function Summary({ label, value, tone, big = false }) {
  const tones = {
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
    sky: 'text-sky-300',
  };
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
        {label}
      </div>
      <div className={`mt-0.5 font-display font-bold ${tones[tone]} ${big ? 'text-lg' : 'text-sm'}`}>
        {value}
      </div>
    </div>
  );
}

function ReportRow({ row }) {
  const strategy = row.strategy ? PRICING_STRATEGIES[row.strategy] : null;
  const profitable = row.profit >= 0;
  return (
    <div className="grid grid-cols-1 gap-2 px-3 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm font-bold text-white">
            {row.busName}
          </span>
          <span className="pill border-white/10 bg-white/5 text-white/55">
            {row.busClass}
          </span>
          {strategy && (
            <span className={`pill ${strategy.tone}`}>{strategy.label}</span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] text-white/55">
          {row.routeLabel} · {row.distanceKm} km · {row.passengers}/{row.capacity} kursi ({formatPercent(row.occupancy)})
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-right sm:min-w-[16rem] sm:grid-cols-3">
        <Cell label="Pendapatan" value={formatIDR(row.revenue)} tone="text-emerald-300" />
        <Cell label="BBM" value={formatIDR(row.fuelCost)} tone="text-rose-300" />
        <Cell
          label="Profit"
          value={formatIDR(row.profit)}
          tone={profitable ? 'text-amber-300' : 'text-rose-300'}
        />
      </div>
    </div>
  );
}

function Cell({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/30 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`text-[11px] font-bold ${tone}`}>{value}</div>
    </div>
  );
}
