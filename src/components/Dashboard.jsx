import { useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { getBusType, PRICING_STRATEGIES } from '../data/busTypes';
import { previewTripEconomics } from '../utils/economics';
import { formatIDR, formatIDRCompact, formatPercent } from '../utils/format';

export default function Dashboard({ onTabChange }) {
  const { state, routesById, assignedCount, dispatchDay } = useGame();

  // Compute daily preview rows for dispatched buses (deterministic mid-band).
  const previews = useMemo(() => {
    return state.fleet.map((bus) => {
      const busType = getBusType(bus.class);
      const route = bus.assignedRoute ? routesById[bus.assignedRoute] : null;
      if (!busType || !route) {
        return { bus, busType, route: null, preview: null };
      }
      const preview = previewTripEconomics({
        busType,
        distanceKm: route.distanceKm,
        strategyId: route.strategy,
      });
      return { bus, busType, route, preview };
    });
  }, [state.fleet, routesById]);

  const totalsPreview = useMemo(() => {
    return previews.reduce(
      (acc, p) => {
        if (!p.preview) return acc;
        acc.revenue += p.preview.expectedRevenue;
        acc.fuel += p.preview.fuelCost;
        acc.profit += p.preview.expectedProfit;
        return acc;
      },
      { revenue: 0, fuel: 0, profit: 0 }
    );
  }, [previews]);

  const canDispatch = state.fleet.length > 0;

  return (
    <div className="space-y-6">
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
              Tekan tombol <span className="font-semibold text-amber-300">BERANGKAT!</span> untuk memulai trip.
              Semua bus dengan trayek aktif akan jalan, biaya BBM dipotong, dan tiket dihitung otomatis.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 lg:items-end">
            <button
              type="button"
              onClick={dispatchDay}
              disabled={!canDispatch}
              className="btn-primary !text-base !py-3.5 !px-7 font-display tracking-wide"
            >
              🚦 BERANGKAT!
            </button>
            <div className="flex items-center justify-between gap-3 text-xs text-white/50 lg:justify-end">
              <span>{assignedCount} dari {state.fleet.length} bus siap jalan</span>
              {assignedCount === 0 && state.fleet.length > 0 && (
                <button
                  onClick={() => onTabChange('garasi')}
                  className="text-amber-300 underline-offset-2 hover:underline"
                >
                  Atur trayek
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
            hint="Tiket × okupansi rata-rata"
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
            hint="Sebelum hasil acak"
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
              Status setiap bus, trayek aktif, dan estimasi trip berikutnya.
            </p>
          </div>
          {state.fleet.length === 0 ? null : (
            <div className="flex gap-2">
              <button onClick={() => onTabChange('dealer')} className="btn-ghost text-xs">
                + Beli bus
              </button>
              <button onClick={() => onTabChange('garasi')} className="btn-secondary text-xs">
                Kelola garasi
              </button>
            </div>
          )}
        </div>

        {state.fleet.length === 0 ? (
          <EmptyFleetCTA onGoDealer={() => onTabChange('dealer')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {previews.map((p) => (
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

function FleetCard({ bus, busType, route, preview, onAssign }) {
  const strategy = route ? PRICING_STRATEGIES[route.strategy] : null;
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
        <span className={`pill ${busType?.badge}`}>{busType?.class}</span>
      </div>

      {route ? (
        <>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
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

          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            <Mini
              label="Tiket"
              value={formatIDRCompact(preview.ticketPrice)}
              tone="text-white"
            />
            <Mini
              label="BBM"
              value={formatIDRCompact(preview.fuelCost)}
              tone="text-rose-300"
            />
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
      ) : (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-black/10 px-3 py-3">
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
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
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
