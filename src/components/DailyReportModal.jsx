import { useGame } from '../context/GameContext';
import { PRICING_STRATEGIES } from '../data/busTypes';
import { formatIDR, formatNumber, formatPercent } from '../utils/format';

export default function DailyReportModal() {
  const { state, clearReport } = useGame();
  const report = state.lastReport;
  // Hide the daily report when the game-over modal is up — that takes priority.
  if (!report || state.gameOver) return null;

  const { day, rows, totals, event, ledger } = report;
  const dispatchedRows = rows.filter((r) => !r.idle);
  const idleRows = rows.filter((r) => r.idle);
  const netProfit = ledger?.netProfit ?? totals.profit;
  const profitable = netProfit >= 0;

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
                  <span className="ml-2 text-rose-300">
                    · {totals.breakdowns}× MOGOK
                  </span>
                )}
              </p>
            </div>
            <button onClick={clearReport} className="btn-ghost text-sm" aria-label="Tutup">
              ✕
            </button>
          </div>

          {event && <EventBanner event={event} />}

          {ledger && <BalanceHeadline ledger={ledger} netProfit={netProfit} />}
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Money breakdown — the single source of truth for "where did
              the money go today?" Itemized so the player sees every line. */}
          {ledger && <MoneyBreakdown ledger={ledger} totals={totals} />}

          {/* Reputation delta */}
          {ledger && (
            <ReputationCard
              delta={ledger.reputationDelta}
              after={ledger.reputationAfter}
            />
          )}

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
            Hari {day} → Hari {day + 1}. Saldo, stamina, dan reputasi otomatis disesuaikan.
          </p>
          <button onClick={clearReport} className="btn-primary">
            Lanjutkan ke hari berikutnya
          </button>
        </footer>
      </div>
    </div>
  );
}

// Hero "balance moved from X to Y" line right under the header.
function BalanceHeadline({ ledger, netProfit }) {
  const tone =
    netProfit >= 0
      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
      : 'border-rose-400/30 bg-rose-500/10 text-rose-100';
  const arrow = netProfit >= 0 ? '↑' : '↓';
  const sign = netProfit >= 0 ? '+' : '−';
  return (
    <div className={`mt-3 rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-white/70">Saldo PO</span>
        <span className="font-display text-lg font-bold text-white">
          {formatIDR(ledger.balanceBefore)}
          <span className="mx-2 text-white/45">→</span>
          {formatIDR(ledger.balanceAfter)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="opacity-80">
          {arrow} Perubahan bersih hari ini
        </span>
        <span className="font-bold">
          {sign}
          {formatIDR(Math.abs(netProfit))}
        </span>
      </div>
    </div>
  );
}

// Itemized "End of Day Summary" — shows exactly where the money went.
function MoneyBreakdown({ ledger, totals }) {
  const lines = [
    {
      label: 'Pendapatan Tiket',
      amount: ledger.revenue,
      sign: '+',
      tone: 'text-emerald-300',
      icon: '🎫',
    },
    ledger.restAreaIncome > 0 && {
      label: 'Komisi Rest Area',
      amount: ledger.restAreaIncome,
      sign: '+',
      tone: 'text-emerald-300',
      icon: '🍱',
      hint: `${formatNumber(ledger.passengers)} penumpang × tarif komisi`,
    },
    {
      label: 'Biaya BBM (Solar)',
      amount: ledger.fuelCost,
      sign: '−',
      tone: 'text-rose-300',
      icon: '⛽',
    },
    {
      label: 'Gaji Supir',
      amount: ledger.driverSalaries,
      sign: '−',
      tone: 'text-rose-300',
      icon: '👤',
    },
    ledger.kernetSalaries > 0 && {
      label: 'Gaji Kernet',
      amount: ledger.kernetSalaries,
      sign: '−',
      tone: 'text-rose-300',
      icon: '🎫',
    },
    (ledger.repairFine > 0 || ledger.extraExpense > 0) && {
      label: 'Perbaikan & Lain-lain',
      amount: (ledger.repairFine || 0) + (ledger.extraExpense || 0),
      sign: '−',
      tone: 'text-rose-300',
      icon: '🛠️',
      hint:
        ledger.repairFine > 0
          ? `Termasuk denda mogok ${formatIDR(ledger.repairFine)}`
          : 'Razia / kejadian jalan',
    },
    ledger.loanTotal > 0 && {
      label: 'Cicilan Bank',
      amount: ledger.loanTotal,
      sign: '−',
      tone: 'text-amber-300',
      icon: '🏦',
      hint: `${formatIDR(ledger.loanInstallment)} pokok + ${formatIDR(
        ledger.loanInterest
      )} bunga`,
    },
  ].filter(Boolean);

  return (
    <section>
      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/55">
        💸 Rincian Uang Hari Ini
        <span className="font-normal normal-case tracking-normal text-white/40">
          (End of Day Summary)
        </span>
      </h4>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
        {lines.map((line, idx) => (
          <BreakdownRow key={`${line.label}-${idx}`} line={line} />
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/40 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <span className="font-display font-bold text-white">
              Total Bersih
            </span>
          </div>
          <span
            className={`font-display text-lg font-extrabold ${
              ledger.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {ledger.netProfit >= 0 ? '+' : '−'}
            {formatIDR(Math.abs(ledger.netProfit))}
          </span>
        </div>
      </div>
    </section>
  );
}

function BreakdownRow({ line }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-base shrink-0">{line.icon}</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white/85">
            {line.label}
          </div>
          {line.hint && (
            <div className="truncate text-[11px] text-white/45">{line.hint}</div>
          )}
        </div>
      </div>
      <div className={`font-display text-sm font-bold ${line.tone}`}>
        {line.sign}
        {formatIDR(line.amount)}
      </div>
    </div>
  );
}

function ReputationCard({ delta, after }) {
  if (delta === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/65">
        Reputasi tetap di <span className="font-bold text-white">{after}</span>/1000.
      </section>
    );
  }
  const positive = delta > 0;
  return (
    <section
      className={`rounded-xl border px-4 py-3 text-sm ${
        positive
          ? 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100'
          : 'border-rose-400/30 bg-rose-500/10 text-rose-100'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{positive ? '⭐' : '⚠️'}</span>
          <span className="font-display font-bold">
            Reputasi {positive ? 'naik' : 'turun'}
          </span>
        </div>
        <div className="text-right">
          <div className="font-display text-base font-extrabold">
            {positive ? '+' : ''}
            {delta}
          </div>
          <div className="text-[11px] opacity-80">sekarang {after}/1000</div>
        </div>
      </div>
    </section>
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
        <span className="font-semibold uppercase tracking-wider opacity-80">
          Kejadian:
        </span>
        <span className="font-bold">{event.title}</span>
      </div>
      {choiceLabel && (
        <div className="mt-0.5 text-[11px] opacity-80">{choiceLabel}</div>
      )}
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
        {row.routeLabel} · {row.distanceKm} km · {row.passengers}/{row.capacity}{' '}
        kursi ({formatPercent(row.occupancy)})
      </div>

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
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            Kernet
          </div>
          <div className="text-xs font-bold text-white">
            {row.kernetName ? (
              <span className="text-orange-300">{row.kernetName}</span>
            ) : (
              <span className="text-white/40">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        <Cell label="Pendapatan" value={formatIDR(row.revenue)} tone="text-emerald-300" />
        <Cell label="BBM" value={formatIDR(row.fuelCost)} tone="text-rose-300" />
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
