import { useGame } from '../context/GameContext';
import { PRICING_STRATEGIES } from '../data/busTypes';
import { formatIDR, formatNumber, formatPercent } from '../utils/format';

export default function DailyReportModal() {
  const { state, clearReport } = useGame();
  const report = state.lastReport;
  if (!report) return null;

  const { day, rows, totals, event, resourcesUsed } = report;
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
                {totals.breakdowns > 0 && (
                  <span className="ml-2 text-rose-300">· {totals.breakdowns}× MOGOK</span>
                )}
              </p>
            </div>
            <button onClick={clearReport} className="btn-ghost text-sm" aria-label="Tutup">
              ✕
            </button>
          </div>

          {event && <EventBanner event={event} />}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Summary label="Pendapatan" value={formatIDR(totals.revenue)} tone="emerald" />
            <Summary label="Gaji Kru" value={formatIDR(totals.salaries)} tone="rose" />
            <Summary
              label="Lain-lain"
              value={formatIDR((totals.extraExpense || 0) + (totals.repairFine || 0))}
              tone="rose"
              hint={totals.repairFine > 0 ? 'termasuk denda mogok' : 'razia / lain-lain'}
            />
            <Summary
              label="Stok Terpakai"
              value={
                resourcesUsed
                  ? `${formatNumber(resourcesUsed.fuel)}L · ${resourcesUsed.tires}b · ${resourcesUsed.parts}p`
                  : '—'
              }
              tone="amber"
              hint="solar · ban · parts"
            />
            <Summary
              label="Profit Bersih"
              value={formatIDR(totals.profit)}
              tone={profitable ? 'amber' : 'rose'}
              big
            />
          </div>
          <div className="mt-1 text-right text-[11px] text-white/45">
            Total penumpang: {formatNumber(totals.passengers)} orang
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {dispatchedRows.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/55">
                Detail per bus berangkat
              </h4>
              <div className="space-y-2">
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
                    <span className="pill border-white/10 bg-white/5 text-white/60">
                      {row.idleLabel ?? 'Tidak berangkat'}
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
            Hari {day} → Hari {day + 1}. Saldo & stamina otomatis disesuaikan.
          </p>
          <button onClick={clearReport} className="btn-primary">
            Lanjutkan ke hari berikutnya
          </button>
        </footer>
      </div>
    </div>
  );
}

function EventBanner({ event }) {
  const tone =
    event.id === 'tiktok'
      ? 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100'
      : event.id === 'macet'
      ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
      : 'border-rose-400/30 bg-rose-500/10 text-rose-100';
  const choiceLabel =
    event.choice === 'bribe'
      ? 'Pilihan: Bayar uang kopi'
      : event.choice === 'refuse'
      ? 'Pilihan: Tolak (kena denda)'
      : null;
  return (
    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{event.icon}</span>
        <span className="font-semibold uppercase tracking-wider opacity-80">Kejadian:</span>
        <span className="font-bold">{event.title}</span>
      </div>
      {choiceLabel && (
        <div className="mt-0.5 text-[11px] opacity-80">{choiceLabel}</div>
      )}
    </div>
  );
}

function Summary({ label, value, tone, big = false, hint }) {
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
      {hint && <div className="mt-0.5 text-[10px] text-white/40">{hint}</div>}
    </div>
  );
}

function ReportRow({ row }) {
  const strategy = row.strategy ? PRICING_STRATEGIES[row.strategy] : null;
  const profitable = row.profit >= 0;
  return (
    <div
      className={`rounded-xl border p-3 text-sm ${
        row.breakdown
          ? 'border-rose-400/40 bg-rose-500/10'
          : 'border-white/10 bg-black/20'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-sm font-bold text-white">
          {row.busName}
        </span>
        <span className="pill border-white/10 bg-white/5 text-white/55">
          {row.busClass}
        </span>
        {strategy && <span className={`pill ${strategy.tone}`}>{strategy.label}</span>}
        {row.breakdown && (
          <span className="pill border-rose-400/40 bg-rose-500/20 text-rose-200">
            🛠 MOGOK
          </span>
        )}
      </div>

      <div className="mt-1 text-[12px] text-white/60">
        {row.routeLabel} · {row.distanceKm} km · {row.passengers}/{row.capacity} kursi (
        {formatPercent(row.occupancy)})
      </div>

      {/* Crew + meters */}
      <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
        <Meter
          label={`Supir: ${row.driverName ?? '—'} (skill ${row.driverSkill ?? '-'})`}
          before={row.staminaBefore}
          after={row.staminaAfter}
          unit="stamina"
          color="text-sky-300"
        />
        <Meter
          label="Kondisi bus"
          before={row.conditionBefore}
          after={row.conditionAfter}
          unit="HP"
          color={row.conditionAfter < 40 ? 'text-amber-300' : 'text-emerald-300'}
        />
        <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-white/40">Kernet</div>
          <div className="text-xs font-bold text-white">
            {row.kernetName ? (
              <span className="text-orange-300">{row.kernetName}</span>
            ) : (
              <span className="text-white/40">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Money breakdown */}
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        <Cell label="Pendapatan" value={formatIDR(row.revenue)} tone="text-emerald-300" />
        <Cell label="Solar" value={`${formatNumber(row.fuelLiters)}L`} tone="text-rose-300" />
        <Cell label="Gaji" value={formatIDR(row.salaries)} tone="text-rose-300" />
        <Cell
          label="Lain-lain"
          value={formatIDR((row.extraExpense || 0) + (row.repairFine || 0))}
          tone="text-rose-300"
        />
        <Cell
          label="Profit"
          value={formatIDR(row.profit)}
          tone={profitable ? 'text-amber-300' : 'text-rose-300'}
        />
      </div>

      {row.eventNotes && row.eventNotes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-white/70">
          {row.eventNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Meter({ label, before, after, unit, color }) {
  const delta = (after ?? 0) - (before ?? 0);
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xs font-bold ${color}`}>
        {before}
        <span className="mx-1 text-white/40">→</span>
        {after}
        <span className="ml-1 text-[10px] text-white/40">{unit}</span>
      </div>
      <div
        className={`text-[10px] ${
          delta < 0 ? 'text-rose-300' : delta > 0 ? 'text-emerald-300' : 'text-white/40'
        }`}
      >
        {delta > 0 ? `+${delta}` : delta}
      </div>
    </div>
  );
}

function Cell({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/30 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-[11px] font-bold ${tone}`}>{value}</div>
    </div>
  );
}
