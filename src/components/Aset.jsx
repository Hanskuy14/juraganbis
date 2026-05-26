import { useGame } from '../context/GameContext';
import {
  GARAGE_LEVELS,
  getGarageLevel,
  nextGarageLevel,
  REST_AREA_CONTRACT,
  REST_AREA_PER_PASSENGER,
  INTERNAL_MECHANIC,
  INTERNAL_MECHANIC_DISCOUNT,
  MAX_GARAGE_LEVEL,
} from '../data/upgrades';
import { formatIDR, formatIDRCompact } from '../utils/format';

export default function Aset({ onTabChange }) {
  const {
    state,
    upgradeGarage,
    buyRestAreaContract,
    buyInternalMechanic,
    garageCap,
  } = useGame();

  return (
    <div className="space-y-6">
      <section className="glass-panel relative overflow-hidden p-5 sm:p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="pill border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
              Aset & Fasilitas
            </span>
            <h2 className="mt-2 font-display text-2xl font-extrabold text-white">
              🏗️ Investasi Permanen
            </h2>
            <p className="mt-1 max-w-xl text-sm text-white/60">
              Beli fasilitas sekali, dapat bonus pasif untuk seterusnya. Cocok untuk PO yang
              sudah stabil cuannya.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/50">Saldo PO</div>
            <div className="font-display text-lg font-bold text-emerald-300">
              {formatIDR(state.balance)}
            </div>
          </div>
        </div>
      </section>

      <GarageCard
        level={state.upgrades.garageLevel}
        currentFleet={state.fleet.length}
        balance={state.balance}
        capacity={garageCap}
        onUpgrade={upgradeGarage}
        onGoDealer={() => onTabChange('dealer')}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <FacilityCard
          spec={REST_AREA_CONTRACT}
          owned={state.upgrades.restAreaContract}
          balance={state.balance}
          onBuy={buyRestAreaContract}
          accent="from-orange-500/20 to-orange-500/5"
          ribbon="Bonus Pasif"
          activeMessage={`Aktif. PO dapat ${formatIDR(REST_AREA_PER_PASSENGER)} per penumpang setiap berangkat.`}
        />
        <FacilityCard
          spec={INTERNAL_MECHANIC}
          owned={state.upgrades.internalMechanic}
          balance={state.balance}
          onBuy={buyInternalMechanic}
          accent="from-sky-500/20 to-sky-500/5"
          ribbon={`-${Math.round(INTERNAL_MECHANIC_DISCOUNT * 100)}% biaya servis`}
          activeMessage={`Aktif. Servis & denda mogok turun ${Math.round(INTERNAL_MECHANIC_DISCOUNT * 100)}% selamanya.`}
        />
      </div>
    </div>
  );
}

// ---- Garasi Pusat (multi-level) ------------------------------------------

function GarageCard({ level, currentFleet, balance, capacity, onUpgrade, onGoDealer }) {
  const current = getGarageLevel(level);
  const next = nextGarageLevel(level);
  const isMax = !next;
  const canAfford = next ? balance >= next.upgradeCost : false;
  const utilization = capacity > 0 ? Math.min(1, currentFleet / capacity) : 0;

  return (
    <section className="glass-panel relative overflow-hidden p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="pill border-amber-400/30 bg-amber-500/10 text-amber-300">
            Level {current.level} / {MAX_GARAGE_LEVEL}
          </span>
          <h3 className="mt-2 font-display text-lg font-bold text-white">
            🏭 Garasi Pusat
          </h3>
          <p className="mt-1 text-xs text-white/60">
            Kapasitas garasi membatasi jumlah armada. Upgrade level untuk menampung lebih banyak bus.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-right">
          <div className="text-[10px] uppercase tracking-wider text-white/50">
            Slot terpakai
          </div>
          <div className="font-display text-xl font-bold text-white">
            {currentFleet} <span className="text-white/40">/ {capacity}</span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full ${
              utilization >= 1
                ? 'bg-rose-400'
                : utilization >= 0.75
                ? 'bg-amber-400'
                : 'bg-emerald-400'
            }`}
            style={{ width: `${Math.round(utilization * 100)}%` }}
          />
        </div>
        {currentFleet >= capacity && (
          <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">
            Garasi penuh! Upgrade level atau jual unit lama sebelum beli bus baru.
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {GARAGE_LEVELS.map((lv) => {
          const owned = lv.level <= level;
          const isCurrent = lv.level === level;
          return (
            <div
              key={lv.level}
              className={`rounded-xl border px-3 py-3 ${
                isCurrent
                  ? 'border-amber-400/50 bg-amber-500/10'
                  : owned
                  ? 'border-emerald-400/30 bg-emerald-500/5'
                  : 'border-white/10 bg-black/20'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                <span className={isCurrent ? 'text-amber-300' : 'text-white/55'}>
                  Level {lv.level}
                </span>
                {owned && !isCurrent && (
                  <span className="text-emerald-300">✓ Lunas</span>
                )}
                {isCurrent && <span className="text-amber-300">Saat ini</span>}
              </div>
              <div className="mt-1 font-display text-base font-bold text-white">
                {lv.capacity} bus
              </div>
              <div className="text-[11px] text-white/45">
                {lv.upgradeCost === 0 ? 'Gratis' : formatIDRCompact(lv.upgradeCost)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        {isMax ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            🏆 Garasi sudah level maksimal. Megah!
          </div>
        ) : (
          <div className="text-sm text-white/70">
            Level berikutnya:{' '}
            <span className="font-bold text-white">{next.capacity} bus</span>
            <span className="text-white/45"> · biaya </span>
            <span className="font-bold text-amber-300">{formatIDR(next.upgradeCost)}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={onGoDealer} className="btn-secondary text-xs">
            🏪 Buka Dealer
          </button>
          {!isMax && (
            <button
              onClick={onUpgrade}
              disabled={!canAfford}
              className="btn-primary"
            >
              {canAfford
                ? `Upgrade ke Level ${next.level}`
                : `Kurang ${formatIDRCompact(next.upgradeCost - balance)}`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- One-shot facilities (rest area, montir) -----------------------------

function FacilityCard({ spec, owned, balance, onBuy, accent, ribbon, activeMessage }) {
  const canAfford = balance >= spec.cost;

  return (
    <article
      className={`glass-card relative overflow-hidden p-5 bg-gradient-to-br ${accent} ${
        owned ? 'ring-1 ring-emerald-400/30' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="pill border-white/15 bg-black/30 text-white/75">{ribbon}</span>
          <h4 className="mt-2 flex items-center gap-2 font-display text-lg font-bold text-white">
            <span className="text-2xl">{spec.icon}</span>
            {spec.name}
          </h4>
          <p className="mt-1 text-xs text-white/60">{spec.tagline}</p>
        </div>
        {owned ? (
          <span className="pill border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
            ✓ Dimiliki
          </span>
        ) : (
          <span className="pill border-amber-400/30 bg-amber-500/10 text-amber-200">
            {formatIDRCompact(spec.cost)}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-white/70">{spec.description}</p>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">
        <div className="text-[10px] uppercase tracking-wider text-white/50">Manfaat</div>
        <div className="text-emerald-300">{spec.benefit}</div>
      </div>

      <div className="mt-4">
        {owned ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {activeMessage}
          </div>
        ) : (
          <button
            onClick={onBuy}
            disabled={!canAfford}
            className="btn-primary w-full"
          >
            {canAfford
              ? `Beli · ${formatIDR(spec.cost)}`
              : `Kurang ${formatIDR(spec.cost - balance)}`}
          </button>
        )}
      </div>
    </article>
  );
}
