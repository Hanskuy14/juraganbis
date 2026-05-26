import { useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { getBusType, PRICING_STRATEGIES } from '../data/busTypes';
import {
  aggregateBoostMultipliers,
  CONDITION_BREAKDOWN_RISK,
  CONDITION_NEEDS_SERVICE,
  previewTripEconomics,
} from '../utils/economics';
import { STAMINA_TIRED_THRESHOLD, staminaTier } from '../data/personnel';
import { formatIDR, formatIDRCompact, formatPercent } from '../utils/format';

export default function Dashboard({ onTabChange }) {
  const {
    state,
    routesById,
    driversById,
    kernetsById,
    assignedCount,
    beginDispatch,
  } = useGame();

  const boostMods = aggregateBoostMultipliers(state.activeBoosts);

  const previews = useMemo(() => {
    return state.fleet.map((bus) => {
      const busType = getBusType(bus.class);
      const route = bus.assignedRoute ? routesById[bus.assignedRoute] : null;
      const driver = bus.assignedDriver ? driversById[bus.assignedDriver] : null;
      const kernet = bus.assignedKernet ? kernetsById[bus.assignedKernet] : null;
      if (!busType || !route) return { bus, busType, route: null, preview: null, driver, kernet };
      const preview = previewTripEconomics({
        busType,
        distanceKm: route.distanceKm,
        strategyId: route.strategy,
        demandMult: boostMods.demandMult,
        hasKernet: Boolean(kernet),
      });
      return { bus, busType, route, preview, driver, kernet };
    });
  }, [state.fleet, routesById, driversById, kernetsById, boostMods.demandMult]);

  const totalsPreview = useMemo(() => {
    return previews.reduce(
      (acc, p) => {
        if (!p.preview) return acc;
        const willDispatch = canDispatch(p);
        if (!willDispatch) return acc;
        acc.revenue += p.preview.expectedRevenue + (p.preview.kernetBonus ?? 0);
        acc.fuel += p.preview.fuelCost;
        acc.salary += (p.driver?.salary ?? 0) + (p.kernet?.salary ?? 0);
        acc.profit += p.preview.expectedProfit - ((p.driver?.salary ?? 0) + (p.kernet?.salary ?? 0));
        return acc;
      },
      { revenue: 0, fuel: 0, salary: 0, profit: 0 }
    );
  }, [previews]);

  const warnings = useMemo(() => buildWarnings(previews), [previews]);
  const canHitDispatch = state.fleet.length > 0;

  return (
    <div className="space-y-6">
      <section className="glass-panel relative overflow-hidden p-5 sm:p-6">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <span className="pill border-amber-400/30 bg-amber-500/10 text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Hari ke-{state.day}
            </span>
            <h2 className="mt-3 font-display text-2xl font-extrabold text-white sm:text-3xl">
              Siap berangkatkan armada malam ini?
            </h2>
            <p className="mt-1.5 text-sm text-white/60">
              Tekan <span className="font-semibold text-amber-300">BERANGKAT!</span>. Bus tanpa supir/trayek tidak jalan, supir lelah istirahat, dan ada peluang 35% kejadian di jalan.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 lg:items-end">
            <button
              type="button"
              onClick={beginDispatch}
              disabled={!canHitDispatch}
              className="btn-primary !px-7 !py-3.5 !text-base font-display tracking-wide"
            >
              🚦 BERANGKAT!
            </button>
            <div className="flex items-center justify-between gap-3 text-xs text-white/50 lg:justify-end">
              <span>{assignedCount} dari {state.fleet.length} bus siap</span>
              {state.fleet.length > 0 && assignedCount < state.fleet.length && (
                <button onClick={() => onTabChange('garasi')} className="text-amber-300 hover:underline">
                  Atur trayek/crew
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PreviewStat label="Estimasi Pendapatan" value={formatIDRCompact(totalsPreview.revenue)} tone="emerald" hint="Tiket + bonus kernet" />
          <PreviewStat label="Estimasi Biaya" value={formatIDRCompact(totalsPreview.fuel + totalsPreview.salary)} tone="rose" hint={`BBM ${formatIDRCompact(totalsPreview.fuel)} + gaji ${formatIDRCompact(totalsPreview.salary)}`} />
          <PreviewStat label="Estimasi Profit" value={formatIDRCompact(totalsPreview.profit)} tone={totalsPreview.profit >= 0 ? 'amber' : 'rose'} hint="Sebelum hasil acak" />
          <PreviewStat label="Saldo Sekarang" value={formatIDRCompact(state.balance)} tone={state.balance < 0 ? 'rose' : 'sky'} hint={`Total: ${formatIDR(state.balance)}`} />
        </div>
      </section>

      {warnings.length > 0 && (
        <section className="glass-panel p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/55">
            ⚠ Perhatian Sebelum Berangkat ({warnings.length})
          </h3>
          <ul className="space-y-1.5">
            {warnings.map((w, idx) => (
              <li key={idx} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${w.tone}`}>
                <span className="mt-0.5">{w.icon}</span>
                <span className="flex-1">
                  <strong className="font-semibold text-white">{w.busName}:</strong>{' '}
                  {w.text}
                </span>
                {w.action && (
                  <button
                    onClick={() => onTabChange(w.action.tab)}
                    className="text-amber-300 hover:underline"
                  >
                    {w.action.label} →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-white">Armada</h3>
            <p className="text-xs text-white/50">
              Status setiap bus, trayek aktif, crew, dan estimasi trip berikutnya.
            </p>
          </div>
          {state.fleet.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => onTabChange('dealer')} className="btn-ghost text-xs">+ Beli bus</button>
              <button onClick={() => onTabChange('garasi')} className="btn-secondary text-xs">Kelola garasi</button>
            </div>
          )}
        </div>

        {state.fleet.length === 0 ? (
          <EmptyFleetCTA onGoDealer={() => onTabChange('dealer')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {previews.map((p) => (
              <FleetCard key={p.bus.id} {...p} onAssign={() => onTabChange('garasi')} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function canDispatch({ bus, route, driver }) {
  if (!route || !driver) return false;
  if (bus.status === 'in_service') return false;
  if (driver.stamina < STAMINA_TIRED_THRESHOLD) return false;
  return true;
}

function buildWarnings(previews) {
  const warnings = [];
  for (const p of previews) {
    const { bus, route, driver } = p;
    if (bus.status === 'in_service') {
      warnings.push({
        busName: bus.name,
        text: 'Dijadwalkan masuk bengkel — tidak akan jalan hari ini.',
        icon: '🛠️',
        tone: 'border-sky-400/30 bg-sky-500/5 text-sky-200',
      });
      continue;
    }
    if (route && !driver) {
      warnings.push({
        busName: bus.name,
        text: 'Punya trayek tapi belum ada supir.',
        icon: '👨‍✈️',
        tone: 'border-rose-400/30 bg-rose-500/5 text-rose-200',
        action: { tab: 'garasi', label: 'Tunjuk supir' },
      });
    }
    if (route && driver && driver.stamina < STAMINA_TIRED_THRESHOLD) {
      warnings.push({
        busName: bus.name,
        text: `Supir kelelahan (${driver.stamina}/100). Bus tidak akan berangkat hari ini.`,
        icon: '😵',
        tone: 'border-amber-400/30 bg-amber-500/5 text-amber-200',
        action: { tab: 'hr', label: 'Cari pengganti' },
      });
    }
    if (bus.condition < CONDITION_BREAKDOWN_RISK) {
      warnings.push({
        busName: bus.name,
        text: `Kondisi ${bus.condition}% — risiko mogok 50% kalau tetap dipaksa.`,
        icon: '🚨',
        tone: 'border-rose-400/30 bg-rose-500/5 text-rose-200',
        action: { tab: 'bengkel', label: 'Service' },
      });
    } else if (bus.condition < CONDITION_NEEDS_SERVICE) {
      warnings.push({
        busName: bus.name,
        text: `Kondisi ${bus.condition}% — sebaiknya service sebelum trip panjang.`,
        icon: '🔧',
        tone: 'border-orange-400/30 bg-orange-500/5 text-orange-200',
        action: { tab: 'bengkel', label: 'Service' },
      });
    }
  }
  return warnings;
}

function PreviewStat({ label, value, hint, tone = 'sky' }) {
  const tones = {
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    amber: 'text-amber-300',
    sky: 'text-sky-300',
  };
  return (
    <div className="glass-card flex flex-col px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</span>
      <span className={`mt-0.5 text-lg font-bold ${tones[tone]}`}>{value}</span>
      <span className="mt-0.5 text-[11px] text-white/40">{hint}</span>
    </div>
  );
}

function FleetCard({ bus, busType, route, preview, driver, kernet, onAssign }) {
  const strategy = route ? PRICING_STRATEGIES[route.strategy] : null;
  const inService = bus.status === 'in_service';
  const stamina = driver ? staminaTier(driver.stamina) : null;

  return (
    <div className={`glass-card relative overflow-hidden bg-gradient-to-br ${busType?.accent ?? ''} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-2xl">
            {busType?.icon}
          </div>
          <div>
            <div className="font-display text-sm font-bold text-white">{bus.name}</div>
            <div className="text-[11px] text-white/60">
              {busType?.class} · {busType?.capacity} kursi · Kondisi {bus.condition}%
            </div>
          </div>
        </div>
        {inService ? (
          <span className="pill border-sky-400/40 bg-sky-500/15 text-sky-200">🛠️ Service</span>
        ) : (
          <span className={`pill ${busType?.badge}`}>{busType?.class}</span>
        )}
      </div>

      <ConditionMini value={bus.condition} />

      {/* crew row */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-white/55">
        <span className="flex items-center gap-1.5">
          👨‍✈️ {driver ? <span className="font-semibold text-white">{driver.name}</span> : <span className="text-rose-300">— belum ada —</span>}
          {stamina && <span className={stamina.tone}>· {stamina.label}</span>}
        </span>
        <span className="flex items-center gap-1">
          🧢 {kernet ? <span className="text-amber-300">Aktif</span> : <span className="text-white/35">Off</span>}
        </span>
      </div>

      {route ? (
        <>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Trayek aktif</span>
              <span className={`pill ${strategy?.tone ?? ''}`}>{strategy?.label}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
              <span>{route.fromName}</span>
              <span className="text-amber-400">→</span>
              <span>{route.toName}</span>
              <span className="ml-auto text-xs font-medium text-white/50">{route.distanceKm} km</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            <Mini label="Tiket" value={formatIDRCompact(preview.ticketPrice)} tone="text-white" />
            <Mini label="BBM" value={formatIDRCompact(preview.fuelCost)} tone="text-rose-300" />
            <Mini
              label="Profit"
              value={formatIDRCompact(preview.expectedProfit - (driver?.salary ?? 0) - (kernet?.salary ?? 0))}
              tone={
                preview.expectedProfit - (driver?.salary ?? 0) - (kernet?.salary ?? 0) >= 0
                  ? 'text-emerald-300'
                  : 'text-rose-300'
              }
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
            <span>Okupansi est.: {formatPercent(preview.expectedOccupancy)}</span>
            <span>{preview.expectedPassengers} penumpang</span>
          </div>
        </>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-black/10 px-3 py-2.5">
          <div>
            <div className="text-sm font-semibold text-white">Belum ada trayek</div>
            <div className="text-[11px] text-white/50">
              {driver ? 'Pasang rute biar bus ikut narik.' : 'Butuh supir + trayek untuk berangkat.'}
            </div>
          </div>
          <button onClick={onAssign} className="btn-secondary text-xs">Atur</button>
        </div>
      )}
    </div>
  );
}

function ConditionMini({ value }) {
  const pct = Math.max(0, Math.min(100, value));
  let color = 'bg-emerald-400';
  if (pct < 70) color = 'bg-amber-400';
  if (pct < CONDITION_NEEDS_SERVICE) color = 'bg-orange-400';
  if (pct < CONDITION_BREAKDOWN_RISK) color = 'bg-rose-500';
  return (
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Mini({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xs font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function EmptyFleetCTA({ onGoDealer }) {
  return (
    <div className="glass-panel flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="text-5xl">🚏</div>
      <h4 className="font-display text-lg font-bold text-white">Garasi masih kosong</h4>
      <p className="max-w-sm text-sm text-white/60">
        Beli unit pertama di Dealer Karoseri untuk mulai melayani penumpang.
      </p>
      <button onClick={onGoDealer} className="btn-primary mt-2">Buka Dealer →</button>
    </div>
  );
}
