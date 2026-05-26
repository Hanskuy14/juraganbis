import { useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { getBusType } from '../data/busTypes';
import {
  calculateRepairCost,
  CONDITION_BREAKDOWN_RISK,
  CONDITION_NEEDS_SERVICE,
} from '../utils/economics';
import { formatIDR, formatIDRCompact } from '../utils/format';

export default function Bengkel({ onTabChange }) {
  const { state, repairBus, cancelRepair } = useGame();

  // Sort by condition asc so the worst-off buses appear first.
  const buses = useMemo(
    () => [...state.fleet].sort((a, b) => a.condition - b.condition),
    [state.fleet]
  );

  if (state.fleet.length === 0) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="text-5xl">🔧</div>
        <h3 className="font-display text-lg font-bold text-white">Bengkel sepi</h3>
        <p className="max-w-sm text-sm text-white/60">
          Belum ada bus untuk diservis. Beli unit dulu di Dealer.
        </p>
        <button onClick={() => onTabChange('dealer')} className="btn-primary mt-2">
          Buka Dealer →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="glass-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">🔧 Bengkel</h2>
          <p className="text-sm text-white/60">
            Service bus untuk pulihkan kondisi ke 100%. Bus yang dijadwalkan service tidak akan jalan hari ini.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Legend tone="emerald" label={`Sehat (≥${CONDITION_NEEDS_SERVICE}%)`} />
          <Legend tone="amber" label={`Perlu Servis (<${CONDITION_NEEDS_SERVICE}%)`} />
          <Legend tone="rose" label={`Risiko Mogok (<${CONDITION_BREAKDOWN_RISK}%)`} />
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {buses.map((bus) => (
          <BengkelRow
            key={bus.id}
            bus={bus}
            balance={state.balance}
            onRepair={() => repairBus(bus.id)}
            onCancel={() => cancelRepair(bus.id)}
          />
        ))}
      </div>
    </div>
  );
}

function BengkelRow({ bus, balance, onRepair, onCancel }) {
  const busType = getBusType(bus.class);
  const cost = calculateRepairCost(bus.condition);
  const inService = bus.status === 'in_service';
  const canAfford = balance >= cost;
  const tone = conditionTone(bus.condition);

  return (
    <article className={`glass-card relative overflow-hidden bg-gradient-to-br ${busType?.accent ?? ''} p-4`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-2xl">
            {busType?.icon}
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-bold text-white">{bus.name}</div>
            <div className="text-[11px] text-white/55">{busType?.name}</div>
          </div>
        </div>
        {inService ? (
          <span className="pill border-sky-400/40 bg-sky-500/15 text-sky-200">
            🛠️ Dijadwalkan service
          </span>
        ) : (
          <span className={`pill ${tone.pill}`}>{tone.label}</span>
        )}
      </header>

      <ConditionBar value={bus.condition} />

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/45">
            Biaya servis (full restore)
          </div>
          <div className="font-display text-lg font-extrabold text-amber-300">
            {bus.condition >= 100 ? 'Tidak perlu' : formatIDR(cost)}
          </div>
          {bus.condition < 100 && (
            <div className="text-[11px] text-white/45">
              ≈ {formatIDRCompact(cost)} dari saldo {formatIDRCompact(balance)}
            </div>
          )}
        </div>

        {bus.condition >= 100 && !inService ? (
          <button disabled className="btn-secondary text-xs opacity-50">
            Sudah 100%
          </button>
        ) : inService ? (
          <button onClick={onCancel} className="btn-ghost text-xs">
            Batalkan Service
          </button>
        ) : (
          <button onClick={onRepair} disabled={!canAfford} className="btn-primary text-xs">
            {canAfford ? 'Service Sekarang' : 'Saldo Kurang'}
          </button>
        )}
      </div>

      {inService && (
        <p className="mt-2 text-[11px] text-sky-200/80">
          Bus akan keluar bengkel besok dalam kondisi 100%.
        </p>
      )}
    </article>
  );
}

function ConditionBar({ value }) {
  const pct = Math.max(0, Math.min(100, value));
  let color = 'bg-emerald-400';
  if (pct < 70) color = 'bg-amber-400';
  if (pct < CONDITION_NEEDS_SERVICE) color = 'bg-orange-400';
  if (pct < CONDITION_BREAKDOWN_RISK) color = 'bg-rose-500';
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-white/55">Kondisi</span>
        <span className="font-semibold text-white">{pct}/100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function conditionTone(c) {
  if (c >= 70) return { label: 'Prima', pill: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' };
  if (c >= CONDITION_NEEDS_SERVICE) return { label: 'Layak', pill: 'border-amber-300/30 bg-amber-500/10 text-amber-200' };
  if (c >= CONDITION_BREAKDOWN_RISK) return { label: 'Perlu Servis', pill: 'border-orange-400/40 bg-orange-500/15 text-orange-200' };
  return { label: 'Risiko Mogok!', pill: 'border-rose-400/50 bg-rose-500/20 text-rose-200' };
}

function Legend({ tone, label }) {
  const tones = {
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-500',
  };
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-white/55">
      <span className={`h-2 w-2 rounded-full ${tones[tone]}`} />
      {label}
    </div>
  );
}
