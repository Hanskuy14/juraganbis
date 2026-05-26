import { useMemo } from 'react';
import { useGame } from '../context/GameContext';
import {
  getBusType,
  PRICING_STRATEGIES,
  CONDITION_NEEDS_SERVICE,
  CONDITION_BREAKDOWN_RISK,
} from '../data/busTypes';
import { previewTripEconomics } from '../utils/economics';
import { STAMINA_FLOOR_TO_DRIVE } from '../data/staff';
import { formatIDR, formatIDRCompact, formatPercent } from '../utils/format';

export default function Dashboard({ onTabChange }) {
  const { state, routesById, driversById, kernetsById, beginDispatch } = useGame();

  // Compute per-bus readiness + economic preview.
  const fleetView = useMemo(() => {
    return state.fleet.map((bus) => {
      const busType = getBusType(bus.class);
      const route = bus.assignedRoute ? routesById[bus.assignedRoute] : null;
      const driver = bus.assignedDriverId ? driversById[bus.assignedDriverId] : null;
      const kernet = bus.assignedKernetId ? kernetsById[bus.assignedKernetId] : null;

      const blocker = firstBlocker({ bus, route, driver });
      const preview = busType && route
        ? previewTripEconomics({
            busType,
            distanceKm: route.distanceKm,
            strategyId: route.strategy,
          })
        : null;

      return { bus, busType, route, driver, kernet, preview, blocker };
    });
  }, [state.fleet, routesById, driversById, kernetsById]);

  const readyCount = fleetView.filter((p) => !p.blocker).length;

  const totalsPreview = useMemo(() => {
    return fleetView.reduce(
      (acc, p) => {
        if (!p.preview || p.blocker) return acc;
        acc.revenue += p.preview.expectedRevenue;
        acc.fuel += p.preview.fuelCost;
        acc.profit += p.preview.expectedProfit;
        return acc;
      },
      { revenue: 0, fuel: 0, profit: 0 }
    );
  }, [fleetView]);

  const canDispatch = state.fleet.length > 0;

  return (
    <div className="space-y-6">
      {/* TikTok boost banner */}
      {state.tiktokBoostDaysLeft > 0 && (
        <div className="glass-panel flex items-center gap-3 border-fuchsia-400/30 bg-fuchsia-500/5 p-4">
          <div className="text-3xl">🎬</div>
          <div className="flex-1">
            <div className="font-display text-sm font-bold text-fuchsia-200">
              Viral di TikTok aktif!
            </div>
            <div className="text-xs text-white/65">
              Demand penumpang naik 30% selama {state.tiktokBoostDaysLeft} hari ke depan.
            </div>
          </div>
          <span className="pill border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200">
            {state.tiktokBoostDaysLeft} hari
          </span>
        </div>
      )}

      {/* Hero strip */}
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
              Bus harus punya <span className="text-amber-300">trayek</span>,
              <span className="text-amber-300"> supir</span>, dan kondisi cukup. Kernet itu opsional.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 lg:items-end">
            <button
              type="button"
              onClick={beginDispatch}
              disabled={!canDispatch}
              className="btn-primary !text-base !py-3.5 !px-7 font-display tracking-wide"
            >
              🚦 BERANGKAT!
            </button>
            <div className="flex items-center justify-between gap-3 text-xs text-white/50 lg:justify-end">
              <span>{readyCount} dari {state.fleet.length} bus siap jalan</span>
              {readyCount === 0 && state.fleet.length > 0 && (
                <button
                  onClick={() => onTabChange('garasi')}
                  className="text-amber-300 underline-offset-2 hover:underline"
                >
                  Atur trayek & kru
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Preview totals */}
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PreviewStat
            label="Estimasi Pendapatan"
            value={formatIDRCompact(totalsPreview.revenue)}
            tone="emerald"
            hint={`Dari ${readyCount} bus siap jalan`}
          />
          <PreviewStat
            label="Estimasi BBM"
            value={formatIDRCompact(totalsPreview.fuel)}
            tone="rose"
            hint="Solar Rp 10.000/L"
          />
          <PreviewStat
            label="Estimasi Profit"
            value={formatIDRCompact(totalsPreview.profit)}
            tone={totalsPreview.profit >= 0 ? 'amber' : 'rose'}
            hint="Sebelum gaji & kejadian"
          />
          <PreviewStat
            label="Saldo Sekarang"
            value={formatIDRCompact(state.balance)}
            tone={state.balance < 0 ? 'rose' : 'sky'}
            hint={`Total: ${formatIDR(state.balance)}`}
          />
        </div>
      </section>

      {/* Fleet list */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-white">Armada</h3>
            <p className="text-xs text-white/50">
              Status setiap bus: trayek, kru, kondisi, dan estimasi trip berikutnya.
            </p>
          </div>
          {state.fleet.length === 0 ? null : (
            <div className="flex gap-2">
              <button onClick={() => onTabChange('hr')} className="btn-ghost text-xs">🏢 HR</button>
              <button onClick={() => onTabChange('bengkel')} className="btn-ghost text-xs">🛠️ Bengkel</button>
              <button onClick={() => onTabChange('garasi')} className="btn-secondary text-xs">
                Garasi →
              </button>
            </div>
          )}
        </div>

        {state.fleet.length === 0 ? (
          <EmptyFleetCTA onGoDealer={() => onTabChange('dealer')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {fleetView.map((p) => (
              <FleetCard
                key={p.bus.id}
                {...p}
                onAssign={() => onTabChange('garasi')}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// A bus is blocked if any of these are true. We surface the FIRST blocker on
// the dashboard card; the Garasi tab shows the full list.
function firstBlocker({ bus, route, driver }) {
  if (bus.inWorkshop) return { tag: 'in_workshop', label: 'Di bengkel' };
  if (!route) return { tag: 'no_route', label: 'Tanpa trayek' };
  if (!driver) return { tag: 'no_driver', label: 'Tanpa supir' };
  if ((driver.stamina ?? 0) < STAMINA_FLOOR_TO_DRIVE) {
    return { tag: 'driver_tired', label: 'Supir lelah' };
  }
  if ((bus.condition ?? 100) < CONDITION_BREAKDOWN_RISK) {
    return { tag: 'risk_breakdown', label: 'Risiko mogok' };
  }
  return null;
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
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
        {label}
      </span>
      <span className={`mt-0.5 text-lg font-bold ${tones[tone]}`}>{value}</span>
      <span className="mt-0.5 text-[11px] text-white/40">{hint}</span>
    </div>
  );
}

function FleetCard({ bus, busType, route, driver, kernet, preview, blocker, onAssign }) {
  const strategy = route ? PRICING_STRATEGIES[route.strategy] : null;
  const condition = bus.condition ?? 100;
  const conditionTone =
    condition < CONDITION_BREAKDOWN_RISK
      ? 'bg-rose-400'
      : condition <= CONDITION_NEEDS_SERVICE
      ? 'bg-amber-400'
      : 'bg-emerald-400';

  return (
    <div
      className={`glass-card relative overflow-hidden bg-gradient-to-br ${
        busType?.accent ?? ''
      } p-4`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-2xl">
            {busType?.icon}
          </div>
          <div>
            <div className="font-display text-sm font-bold text-white">
              {bus.name}
            </div>
            <div className="text-[11px] text-white/60">
              {busType?.class} · {busType?.capacity} kursi · {busType?.fuelEfficiency} km/L
            </div>
          </div>
        </div>
        {blocker ? (
          <span className="pill border-rose-400/40 bg-rose-500/15 text-rose-200">
            {blocker.label}
          </span>
        ) : (
          <span className="pill border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
            ✓ Siap
          </span>
        )}
      </div>

      {/* Condition strip */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/45">
          <span>Kondisi</span>
          <span>{condition}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className={`h-full ${conditionTone}`} style={{ width: `${condition}%` }} />
        </div>
      </div>

      {/* Crew strip */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-white/65">
        <span>
          👤 {driver ? `${driver.name} (skill ${driver.skill})` : <span className="text-rose-300">Tanpa supir</span>}
        </span>
        {kernet && <span className="text-orange-300">+ {kernet.name}</span>}
      </div>

      {route ? (
        <>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Trayek aktif</span>
              <span className={`pill ${strategy?.tone ?? ''}`}>
                {strategy?.label}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
              <span>{route.fromName}</span>
              <span className="text-amber-400">→</span>
              <span>{route.toName}</span>
              <span className="ml-auto text-xs font-medium text-white/50">
                {route.distanceKm} km
              </span>
            </div>
          </div>

          {preview && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                <Mini label="Tiket" value={formatIDRCompact(preview.ticketPrice)} tone="text-white" />
                <Mini label="BBM" value={formatIDRCompact(preview.fuelCost)} tone="text-rose-300" />
                <Mini
                  label="Profit"
                  value={formatIDRCompact(preview.expectedProfit)}
                  tone={preview.expectedProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
                <span>Okupansi est.: {formatPercent(preview.expectedOccupancy)}</span>
                <span>{preview.expectedPassengers} penumpang</span>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-black/10 px-3 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Belum ada trayek</div>
            <div className="text-[11px] text-white/50">
              Pasang rute biar bus ini ikut narik malam ini.
            </div>
          </div>
          <button onClick={onAssign} className="btn-secondary text-xs">
            Atur Trayek
          </button>
        </div>
      )}
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
      <h4 className="font-display text-lg font-bold text-white">
        Garasi masih kosong
      </h4>
      <p className="max-w-sm text-sm text-white/60">
        Beli unit pertama di Dealer Karoseri untuk mulai melayani penumpang.
        Modal awal cukup untuk 1-2 unit Bumel.
      </p>
      <button onClick={onGoDealer} className="btn-primary mt-2">
        Buka Dealer →
      </button>
    </div>
  );
}
