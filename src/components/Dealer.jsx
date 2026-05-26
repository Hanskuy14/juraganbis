import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { BUS_TYPES } from '../data/busTypes';
import { formatIDR, formatNumber } from '../utils/format';

export default function Dealer({ onTabChange }) {
  const { state, buyBus } = useGame();
  const [purchasing, setPurchasing] = useState(null); // busTypeId
  const [customName, setCustomName] = useState('');

  const handleConfirmPurchase = (busType) => {
    buyBus(busType.id, customName);
    setPurchasing(null);
    setCustomName('');
  };

  return (
    <div className="space-y-6">
      <section className="glass-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            🏪 Dealer Karoseri
          </h2>
          <p className="text-sm text-white/60">
            Pilih bus sesuai strategi PO-mu. Spesifikasi pabrik tertera apa adanya.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/50">
              Saldo
            </div>
            <div className="font-display text-base font-bold text-emerald-300">
              {formatIDR(state.balance)}
            </div>
          </div>
          <button
            onClick={() => onTabChange('garasi')}
            className="btn-secondary text-xs"
          >
            Garasi →
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {BUS_TYPES.map((bt) => {
          const canAfford = state.balance >= bt.price;
          return (
            <article
              key={bt.id}
              className={`glass-card relative flex flex-col overflow-hidden bg-gradient-to-br ${bt.accent}`}
            >
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div>
                  <span className={`pill ${bt.badge}`}>{bt.class}</span>
                  <h3 className="mt-2 font-display text-lg font-extrabold text-white">
                    {bt.name}
                  </h3>
                  <p className="mt-1 text-xs text-white/60">{bt.tagline}</p>
                </div>
                <div className="text-4xl drop-shadow-lg">{bt.icon}</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 px-5">
                <Spec label="Kapasitas" value={`${bt.capacity} kursi`} />
                <Spec label="Konsumsi" value={`${bt.fuelEfficiency} km/L`} />
                <Spec label="Tarif/km" value={formatIDR(bt.pricePerKm)} />
                <Spec
                  label="Prestise"
                  value={'★'.repeat(bt.prestige) + '☆'.repeat(5 - bt.prestige)}
                />
              </div>

              <div className="mt-5 px-5 pb-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-white/50">
                    Harga unit
                  </span>
                  <span className="font-display text-xl font-extrabold text-amber-300">
                    {formatIDR(bt.price)}
                  </span>
                </div>

                {!canAfford && (
                  <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">
                    Saldo kurang {formatIDR(bt.price - state.balance)}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!canAfford}
                  onClick={() => {
                    setPurchasing(bt.id);
                    setCustomName('');
                  }}
                  className="btn-primary mt-3 w-full"
                >
                  {canAfford ? 'Beli Bus' : 'Belum Mampu'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Hint about per-strategy economics */}
      <section className="glass-panel p-5">
        <h3 className="font-display text-sm font-bold text-white">
          💡 Cara cuan dari setiap kelas
        </h3>
        <ul className="mt-2 space-y-1.5 text-xs text-white/60">
          <li>
            <span className="font-semibold text-emerald-300">Bumel</span> — andalan rute pendek-menengah, BBM irit, untungnya dari volume penumpang.
          </li>
          <li>
            <span className="font-semibold text-sky-300">Patas</span> — sweet spot. AC dingin, rasio biaya & tarif paling seimbang.
          </li>
          <li>
            <span className="font-semibold text-amber-300">Sleeper</span> — kelas premium. Wajib pakai trayek panjang (Jakarta-Surabaya, Banyuwangi) biar margin per kursi worth it.
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-white/40">
          Solar disimulasikan tetap di Rp 10.000/L. Trayek diatur di tab Garasi setelah unit terbeli.
        </p>
      </section>

      {purchasing && (
        <PurchaseModal
          busType={BUS_TYPES.find((b) => b.id === purchasing)}
          customName={customName}
          setCustomName={setCustomName}
          onCancel={() => {
            setPurchasing(null);
            setCustomName('');
          }}
          onConfirm={(bt) => handleConfirmPurchase(bt)}
          balance={state.balance}
          ordinal={state.fleet.length + 1}
        />
      )}
    </div>
  );
}

function Spec({ label, value }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function PurchaseModal({
  busType,
  customName,
  setCustomName,
  onCancel,
  onConfirm,
  balance,
  ordinal,
}) {
  const fallbackName = `${busType.name.split(' / ')[0]} #${String(ordinal).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={`pill ${busType.badge}`}>{busType.class}</span>
            <h3 className="mt-2 font-display text-xl font-extrabold text-white">
              Konfirmasi pembelian
            </h3>
            <p className="text-xs text-white/60">{busType.name}</p>
          </div>
          <div className="text-4xl">{busType.icon}</div>
        </div>

        <div className="mt-4 space-y-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
          <Row label="Harga unit" value={formatIDR(busType.price)} valueClass="text-amber-300" />
          <Row label="Saldo saat ini" value={formatIDR(balance)} />
          <Row
            label="Saldo setelah beli"
            value={formatIDR(balance - busType.price)}
            valueClass={balance - busType.price < 0 ? 'text-rose-300' : 'text-emerald-300'}
          />
          <Row
            label="Kapasitas / Konsumsi"
            value={`${formatNumber(busType.capacity)} kursi · ${busType.fuelEfficiency} km/L`}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="bus-name" className="field-label">
            Nama bus (opsional)
          </label>
          <input
            id="bus-name"
            type="text"
            maxLength={28}
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={fallbackName}
            className="field-input"
          />
          <p className="mt-1 text-[11px] text-white/40">
            Kosongkan untuk pakai nama otomatis: <span className="text-white/60">{fallbackName}</span>.
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1">
            Batal
          </button>
          <button
            onClick={() => onConfirm(busType)}
            disabled={balance < busType.price}
            className="btn-primary flex-1"
          >
            Bayar Sekarang
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass = 'text-white' }) {
  return (
    <div className="flex items-center justify-between text-white/60">
      <span>{label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}
