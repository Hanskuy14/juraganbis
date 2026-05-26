import { useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import { getBusType, PRICING_STRATEGIES } from '../data/busTypes';
import { CITIES } from '../data/cities';
import { getDistance, hasDistance } from '../data/distanceMatrix';
import { previewTripEconomics } from '../utils/economics';
import { formatIDR, formatIDRCompact, formatPercent } from '../utils/format';

export default function Garasi({ onTabChange }) {
  const { state, routesById, unassignRoute, sellBus } = useGame();
  const [editing, setEditing] = useState(null); // bus object
  const [confirmSell, setConfirmSell] = useState(null); // bus.id

  if (state.fleet.length === 0) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="text-5xl">🅿️</div>
        <h3 className="font-display text-lg font-bold text-white">
          Garasi belum diisi
        </h3>
        <p className="max-w-sm text-sm text-white/60">
          Beli minimal satu bus di Dealer dulu, baru kamu bisa atur trayek di sini.
        </p>
        <button onClick={() => onTabChange('dealer')} className="btn-primary mt-2">
          Buka Dealer →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">🚌 Garasi</h2>
          <p className="text-sm text-white/60">
            Pasang trayek bebas dari kombinasi 11 kota di Pulau Jawa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onTabChange('dealer')} className="btn-secondary text-xs">
            + Tambah unit
          </button>
          <button onClick={() => onTabChange('dashboard')} className="btn-ghost text-xs">
            ← Dashboard
          </button>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {state.fleet.map((bus) => (
          <BusRow
            key={bus.id}
            bus={bus}
            route={bus.assignedRoute ? routesById[bus.assignedRoute] : null}
            onAssignClick={() => setEditing(bus)}
            onUnassign={() => unassignRoute(bus.id)}
            onSellClick={() => setConfirmSell(bus.id)}
          />
        ))}
      </div>

      {editing && (
        <RouteModal
          bus={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmSell && (
        <SellModal
          bus={state.fleet.find((b) => b.id === confirmSell)}
          onCancel={() => setConfirmSell(null)}
          onConfirm={() => {
            sellBus(confirmSell);
            setConfirmSell(null);
          }}
        />
      )}
    </div>
  );
}

// ---- Single bus row in the garage list -----------------------------------

function BusRow({ bus, route, onAssignClick, onUnassign, onSellClick }) {
  const busType = getBusType(bus.class);
  const strategy = route ? PRICING_STRATEGIES[route.strategy] : null;

  const preview = useMemo(() => {
    if (!busType || !route) return null;
    return previewTripEconomics({
      busType,
      distanceKm: route.distanceKm,
      strategyId: route.strategy,
    });
  }, [busType, route]);

  return (
    <article
      className={`glass-card relative overflow-hidden bg-gradient-to-br ${busType?.accent ?? ''} p-4`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-black/30 text-2xl">
            {busType?.icon}
          </div>
          <div className="leading-tight">
            <div className="font-display text-base font-bold text-white">
              {bus.name}
            </div>
            <div className="text-[11px] text-white/55">
              {busType?.name} · {busType?.capacity} kursi · {busType?.fuelEfficiency} km/L
            </div>
          </div>
        </div>
        <button onClick={onSellClick} className="btn-ghost text-xs text-rose-300/80 hover:text-rose-200">
          Jual
        </button>
      </header>

      {route ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/45">
            <span>Trayek aktif</span>
            <span className={`pill ${strategy?.tone}`}>Tarif {strategy?.label}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-base font-bold text-white">
            <span>{route.fromName}</span>
            <span className="text-amber-400">→</span>
            <span>{route.toName}</span>
            <span className="ml-auto text-xs font-medium text-white/55">
              {route.distanceKm} km
            </span>
          </div>

          {preview && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Tiket/kursi" value={formatIDRCompact(preview.ticketPrice)} />
              <Stat label="BBM trip" value={formatIDRCompact(preview.fuelCost)} tone="text-rose-300" />
              <Stat label="Okupansi" value={formatPercent(preview.expectedOccupancy)} />
              <Stat
                label="Profit est."
                value={formatIDRCompact(preview.expectedProfit)}
                tone={preview.expectedProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}
              />
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button onClick={onAssignClick} className="btn-secondary flex-1 text-xs">
              Ubah trayek
            </button>
            <button onClick={onUnassign} className="btn-ghost text-xs">
              Lepas
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-black/15 px-3 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Bus nganggur</div>
            <div className="text-[11px] text-white/55">
              Pasang trayek biar bus ikut jalan saat dispatch.
            </div>
          </div>
          <button onClick={onAssignClick} className="btn-primary text-xs">
            Atur Trayek
          </button>
        </div>
      )}
    </article>
  );
}

function Stat({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`text-xs font-bold ${tone}`}>{value}</div>
    </div>
  );
}

// ---- Route assignment modal ----------------------------------------------

function RouteModal({ bus, onClose }) {
  const { assignRoute, routesById } = useGame();
  const busType = getBusType(bus.class);
  const existing = bus.assignedRoute ? routesById[bus.assignedRoute] : null;

  const [fromId, setFromId] = useState(existing?.fromId ?? '');
  const [toId, setToId] = useState(existing?.toId ?? '');
  const [strategy, setStrategy] = useState(existing?.strategy ?? 'normal');

  const distanceKm = fromId && toId ? getDistance(fromId, toId) : 0;
  const validPair = fromId && toId && fromId !== toId && hasDistance(fromId, toId);

  const preview = useMemo(() => {
    if (!validPair || !busType) return null;
    return previewTripEconomics({ busType, distanceKm, strategyId: strategy });
  }, [validPair, busType, distanceKm, strategy]);

  const submit = () => {
    if (!validPair) return;
    assignRoute(bus.id, fromId, toId, strategy);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-2xl overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-2xl">
              {busType?.icon}
            </div>
            <div>
              <div className="font-display text-lg font-bold text-white">
                Atur Trayek
              </div>
              <div className="text-xs text-white/55">
                {bus.name} · {busType?.class}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost text-sm">
            ✕
          </button>
        </header>

        <div className="space-y-5 p-5">
          {/* City pickers */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Terminal Asal</label>
              <CitySelect value={fromId} onChange={setFromId} excludeId={toId} />
            </div>
            <div>
              <label className="field-label">Terminal Tujuan</label>
              <CitySelect value={toId} onChange={setToId} excludeId={fromId} />
            </div>
          </div>

          <RouteSummary
            fromId={fromId}
            toId={toId}
            distanceKm={distanceKm}
            validPair={validPair}
          />

          {/* Strategy picker */}
          <div>
            <div className="field-label">Strategi Tiket</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.values(PRICING_STRATEGIES).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStrategy(s.id)}
                  className={`rounded-xl border px-3 py-3 text-left transition-all ${
                    strategy === s.id
                      ? `${s.tone} ring-2 ring-current/30`
                      : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-bold">
                      {s.label}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                      ×{s.factor}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] opacity-80">
                    {s.description}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider opacity-60">
                    Okupansi: {Math.round(s.occupancy[0] * 100)}–
                    {Math.round(s.occupancy[1] * 100)}%
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Live preview */}
          <PreviewBlock preview={preview} validPair={validPair} bus={bus} />
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/10 bg-black/20 p-4">
          <button onClick={onClose} className="btn-secondary">
            Batal
          </button>
          <button onClick={submit} disabled={!validPair} className="btn-primary">
            {existing ? 'Simpan Perubahan' : 'Pasang Trayek'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CitySelect({ value, onChange, excludeId }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="field-input appearance-none"
    >
      <option value="" className="bg-ink-900">
        — Pilih kota —
      </option>
      {CITIES.map((c) => (
        <option
          key={c.id}
          value={c.id}
          disabled={c.id === excludeId}
          className="bg-ink-900"
        >
          {c.name} · {c.region}
        </option>
      ))}
    </select>
  );
}

function RouteSummary({ fromId, toId, distanceKm, validPair }) {
  if (!fromId || !toId) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-black/15 px-4 py-3 text-xs text-white/55">
        Pilih kota asal dan tujuan untuk melihat jarak rute.
      </div>
    );
  }
  if (fromId === toId) {
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
        Asal dan tujuan tidak boleh sama.
      </div>
    );
  }
  if (!validPair) {
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
        Rute ini belum tersedia di matriks jarak.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm text-white">
      Jarak rute: <span className="font-bold text-amber-300">{distanceKm} km</span>
      <span className="ml-2 text-xs text-white/50">(perhitungan dua arah identik)</span>
    </div>
  );
}

function PreviewBlock({ preview, validPair, bus }) {
  const busType = getBusType(bus.class);
  if (!validPair || !preview) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/55">
        Estimasi muncul setelah trayek dipilih.
      </div>
    );
  }

  const losing = preview.expectedProfit < 0;
  return (
    <div className={`rounded-xl border p-4 ${losing ? 'border-rose-400/30 bg-rose-500/5' : 'border-emerald-400/20 bg-emerald-500/5'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
          Estimasi per trip
        </span>
        {losing ? (
          <span className="pill border-rose-400/40 bg-rose-500/20 text-rose-200">
            ⚠ Berisiko rugi
          </span>
        ) : (
          <span className="pill border-emerald-400/40 bg-emerald-500/20 text-emerald-200">
            ✓ Cuan
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Tiket/kursi" value={formatIDR(preview.ticketPrice)} />
        <Stat
          label="BBM trip"
          value={formatIDR(preview.fuelCost)}
          tone="text-rose-300"
        />
        <Stat
          label="Okupansi est."
          value={`${formatPercent(preview.expectedOccupancy)} · ${preview.expectedPassengers}/${busType.capacity}`}
        />
        <Stat
          label="Profit est."
          value={formatIDR(preview.expectedProfit)}
          tone={losing ? 'text-rose-300' : 'text-emerald-300'}
        />
      </div>
      <p className="mt-2 text-[11px] text-white/45">
        Pendapatan = Tarif/km × Jarak × Faktor strategi × Penumpang. Penumpang acak dalam rentang okupansi strategi.
      </p>
    </div>
  );
}

// ---- Sell modal ----------------------------------------------------------

function SellModal({ bus, onCancel, onConfirm }) {
  if (!bus) return null;
  const busType = getBusType(bus.class);
  const refund = Math.round((busType?.price ?? 0) * 0.6);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md p-6">
        <h3 className="font-display text-lg font-bold text-white">Jual bus?</h3>
        <p className="mt-1 text-sm text-white/60">
          {bus.name} ({busType?.class}) akan dijual ke pengepul. Trayek otomatis dilepas.
        </p>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
          <div className="flex justify-between text-white/60">
            <span>Harga unit baru</span>
            <span className="font-semibold text-white">{formatIDR(busType?.price ?? 0)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Refund (60%)</span>
            <span className="font-semibold text-emerald-300">{formatIDR(refund)}</span>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1">
            Batal
          </button>
          <button onClick={onConfirm} className="btn-danger flex-1">
            Ya, Jual
          </button>
        </div>
      </div>
    </div>
  );
}
