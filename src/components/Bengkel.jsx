import { useGame } from '../context/GameContext';
import {
  getBusType,
  CONDITION_MAX,
  CONDITION_NEEDS_SERVICE,
  CONDITION_BREAKDOWN_RISK,
} from '../data/busTypes';
import {
  INTERNAL_MECHANIC_DISCOUNT,
  discountedRepairCost,
} from '../data/upgrades';
import { formatIDR } from '../utils/format';

export default function Bengkel({ onTabChange }) {
  const { state, repairBus } = useGame();
  const hasInternalMechanic = state.upgrades.internalMechanic;

  if (state.fleet.length === 0) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="text-5xl">🛠️</div>
        <h3 className="font-display text-lg font-bold text-white">Bengkel kosong</h3>
        <p className="max-w-sm text-sm text-white/60">
          Belum ada armada untuk diservis. Beli unit dulu di Dealer Karoseri.
        </p>
        <button onClick={() => onTabChange('dealer')} className="btn-primary mt-2">
          Buka Dealer →
        </button>
      </div>
    );
  }

  const sorted = [...state.fleet].sort(
    (a, b) => (a.condition ?? 100) - (b.condition ?? 100)
  );

  return (
    <div className="space-y-6">
      <section className="glass-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">🛠️ Bengkel</h2>
          <p className="text-sm text-white/60">
            Servis bus untuk mengembalikan kondisi ke 100%. Bus yang masuk bengkel
            <span className="text-amber-300"> tidak bisa berangkat hari ini</span>.
          </p>
          {hasInternalMechanic && (
            <p className="mt-1 text-xs text-emerald-300">
              🔧 Fasilitas Montir Internal aktif — diskon{' '}
              {Math.round(INTERNAL_MECHANIC_DISCOUNT * 100)}% di semua servis.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/50">Saldo</div>
            <div className="font-display text-base font-bold text-emerald-300">
              {formatIDR(state.balance)}
            </div>
          </div>
          <button onClick={() => onTabChange('garasi')} className="btn-secondary text-xs">
            Garasi →
          </button>
        </div>
      </section>

      <Legend />

      <div className="grid gap-3 lg:grid-cols-2">
        {sorted.map((bus) => (
          <RepairCard
            key={bus.id}
            bus={bus}
            balance={state.balance}
            hasInternalMechanic={hasInternalMechanic}
            onRepair={() => repairBus(bus.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <LegendChip
        tone="border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
        label={`Sehat`}
        hint={`Kondisi > ${CONDITION_NEEDS_SERVICE}%`}
      />
      <LegendChip
        tone="border-amber-400/30 bg-amber-500/10 text-amber-200"
        label="Butuh Servis"
        hint={`Kondisi ≤ ${CONDITION_NEEDS_SERVICE}% — disarankan ke bengkel`}
      />
      <LegendChip
        tone="border-rose-400/40 bg-rose-500/15 text-rose-200"
        label="Risiko Mogok"
        hint={`Kondisi < ${CONDITION_BREAKDOWN_RISK}% — 50% mogok per trip`}
      />
    </div>
  );
}

function LegendChip({ label, hint, tone }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone}`}>
      <div className="text-xs font-bold">{label}</div>
      <div className="text-[11px] opacity-80">{hint}</div>
    </div>
  );
}

function RepairCard({ bus, balance, hasInternalMechanic, onRepair }) {
  const busType = getBusType(bus.class);
  const condition = bus.condition ?? CONDITION_MAX;
  const points = CONDITION_MAX - condition;
  const rawCost = points * (busType?.repairCostPerPoint ?? 200_000);
  const cost = discountedRepairCost(rawCost, hasInternalMechanic);
  const discountSaved = rawCost - cost;
  const canAfford = balance >= cost && points > 0;
  const status = conditionStatus(condition);

  return (
    <article
      className={`glass-card relative overflow-hidden bg-gradient-to-br ${busType?.accent ?? ''} p-4`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-black/30 text-2xl">
            {busType?.icon}
          </div>
          <div>
            <div className="font-display text-base font-bold text-white">{bus.name}</div>
            <div className="text-[11px] text-white/55">
              {busType?.name} · biaya servis {formatIDR(busType?.repairCostPerPoint ?? 0)}/poin
            </div>
          </div>
        </div>
        <span className={`pill ${status.pill}`}>{status.label}</span>
      </header>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/55">
          <span>Kondisi</span>
          <span className={status.text}>{condition}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full ${status.bar}`}
            style={{ width: `${condition}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <Cell label="Poin rusak" value={`${points}`} tone={points > 0 ? 'text-rose-300' : 'text-white/60'} />
        <Cell
          label="Biaya servis"
          value={formatIDR(cost)}
          tone="text-amber-300"
          hint={discountSaved > 0 ? `−${formatIDR(discountSaved)} montir internal` : null}
        />
        <Cell
          label="Status hari ini"
          value={bus.inWorkshop ? 'Di bengkel' : 'Siap servis'}
          tone={bus.inWorkshop ? 'text-amber-300' : 'text-emerald-300'}
        />
      </div>

      <div className="mt-3 flex gap-2">
        {bus.inWorkshop ? (
          <div className="flex-1 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Sudah masuk bengkel hari ini. Akan keluar besok pagi setelah dispatch.
          </div>
        ) : (
          <button
            onClick={onRepair}
            disabled={!canAfford}
            className="btn-primary flex-1 text-sm"
          >
            {points === 0
              ? 'Sudah 100% — tidak perlu'
              : canAfford
              ? `Servis sekarang · ${formatIDR(cost)}`
              : `Saldo kurang ${formatIDR(cost - balance)}`}
          </button>
        )}
      </div>
    </article>
  );
}

function Cell({ label, value, tone = 'text-white', hint }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xs font-bold ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-emerald-300/80">{hint}</div>}
    </div>
  );
}

function conditionStatus(condition) {
  if (condition < CONDITION_BREAKDOWN_RISK) {
    return {
      label: 'Risiko Mogok',
      pill: 'border-rose-400/40 bg-rose-500/15 text-rose-200',
      text: 'text-rose-300',
      bar: 'bg-rose-400',
    };
  }
  if (condition <= CONDITION_NEEDS_SERVICE) {
    return {
      label: 'Butuh Servis',
      pill: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
      text: 'text-amber-300',
      bar: 'bg-amber-400',
    };
  }
  return {
    label: 'Sehat',
    pill: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    text: 'text-emerald-300',
    bar: 'bg-emerald-400',
  };
}
