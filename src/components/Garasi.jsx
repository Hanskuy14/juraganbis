import { useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import { getBusType, PRICING_STRATEGIES } from '../data/busTypes';
import { CITIES } from '../data/cities';
import { getDistance, hasDistance } from '../data/distanceMatrix';
import {
  CONDITION_BREAKDOWN_RISK,
  CONDITION_NEEDS_SERVICE,
  previewTripEconomics,
} from '../utils/economics';
import { skillTier, staminaTier, STAMINA_TIRED_THRESHOLD } from '../data/personnel';
import { formatIDR, formatIDRCompact, formatPercent } from '../utils/format';

export default function Garasi({ onTabChange }) {
  const {
    state,
    routesById,
    driversById,
    kernetsById,
    unassignRoute,
    unassignDriver,
    unassignKernet,
    sellBus,
  } = useGame();
  const [editingRoute, setEditingRoute] = useState(null);
  const [editingCrew, setEditingCrew] = useState(null); // { busId, kind: 'driver'|'kernet' }
  const [confirmSell, setConfirmSell] = useState(null);

  if (state.fleet.length === 0) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="text-5xl">🅿️</div>
        <h3 className="font-display text-lg font-bold text-white">Garasi belum diisi</h3>
        <p className="max-w-sm text-sm text-white/60">
          Beli minimal satu bus di Dealer dulu, baru kamu bisa atur trayek dan crew di sini.
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
            Atur trayek, supir, dan kernet untuk tiap unit. Bus tanpa supir tidak akan jalan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onTabChange('hr')} className="btn-secondary text-xs">
            🏢 Rekrut Crew
          </button>
          <button onClick={() => onTabChange('bengkel')} className="btn-secondary text-xs">
            🔧 Bengkel
          </button>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {state.fleet.map((bus) => (
          <BusRow
            key={bus.id}
            bus={bus}
            route={bus.assignedRoute ? routesById[bus.assignedRoute] : null}
            driver={bus.assignedDriver ? driversById[bus.assignedDriver] : null}
            kernet={bus.assignedKernet ? kernetsById[bus.assignedKernet] : null}
            onAssignRouteClick={() => setEditingRoute(bus)}
            onUnassignRoute={() => unassignRoute(bus.id)}
            onAssignDriverClick={() => setEditingCrew({ busId: bus.id, kind: 'driver' })}
            onUnassignDriver={() => unassignDriver(bus.id)}
            onAssignKernetClick={() => setEditingCrew({ busId: bus.id, kind: 'kernet' })}
            onUnassignKernet={() => unassignKernet(bus.id)}
            onSellClick={() => setConfirmSell(bus.id)}
          />
        ))}
      </div>

      {editingRoute && (
        <RouteModal bus={editingRoute} onClose={() => setEditingRoute(null)} />
      )}
      {editingCrew && (
        <CrewModal
          busId={editingCrew.busId}
          kind={editingCrew.kind}
          onClose={() => setEditingCrew(null)}
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

// --- Single bus row -------------------------------------------------------

function BusRow({
  bus,
  route,
  driver,
  kernet,
  onAssignRouteClick,
  onUnassignRoute,
  onAssignDriverClick,
  onUnassignDriver,
  onAssignKernetClick,
  onUnassignKernet,
  onSellClick,
}) {
  const busType = getBusType(bus.class);
  const strategy = route ? PRICING_STRATEGIES[route.strategy] : null;

  const preview = useMemo(() => {
    if (!busType || !route) return null;
    return previewTripEconomics({
      busType,
      distanceKm: route.distanceKm,
      strategyId: route.strategy,
      hasKernet: Boolean(kernet),
    });
  }, [busType, route, kernet]);

  const dispatchReady =
    bus.status !== 'in_service' &&
    Boolean(route) &&
    Boolean(driver) &&
    driver.stamina >= STAMINA_TIRED_THRESHOLD &&
    bus.condition >= CONDITION_BREAKDOWN_RISK;

  const blockingReason = blockingReasonFor(bus, driver, route);

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
            <div className="font-display text-base font-bold text-white">{bus.name}</div>
            <div className="text-[11px] text-white/55">
              {busType?.name} · {busType?.capacity} kursi · {busType?.fuelEfficiency} km/L
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusPill bus={bus} dispatchReady={dispatchReady} />
          <button onClick={onSellClick} className="btn-ghost text-[11px] text-rose-300/80 hover:text-rose-200">
            Jual
          </button>
        </div>
      </header>

      <ConditionBar value={bus.condition} />

      {/* Crew slots */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <CrewSlot
          kind="driver"
          person={driver}
          onAssign={onAssignDriverClick}
          onUnassign={onUnassignDriver}
        />
        <CrewSlot
          kind="kernet"
          person={kernet}
          onAssign={onAssignKernetClick}
          onUnassign={onUnassignKernet}
        />
      </div>

      {/* Route */}
      {route ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/45">
            <span>Trayek aktif</span>
            <span className={`pill ${strategy?.tone}`}>Tarif {strategy?.label}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-base font-bold text-white">
            <span>{route.fromName}</span>
            <span className="text-amber-400">→</span>
            <span>{route.toName}</span>
            <span className="ml-auto text-xs font-medium text-white/55">{route.distanceKm} km</span>
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
            <button onClick={onAssignRouteClick} className="btn-secondary flex-1 text-xs">
              Ubah trayek
            </button>
            <button onClick={onUnassignRoute} className="btn-ghost text-xs">Lepas</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-black/15 px-3 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Belum ada trayek</div>
            <div className="text-[11px] text-white/55">Pasang rute biar bus ikut jalan saat dispatch.</div>
          </div>
          <button onClick={onAssignRouteClick} className="btn-primary text-xs">Atur Trayek</button>
        </div>
      )}

      {/* Blocking reason */}
      {blockingReason && (
        <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          ⚠ {blockingReason}
        </div>
      )}
    </article>
  );
}

function blockingReasonFor(bus, driver, route) {
  if (bus.status === 'in_service') return 'Bus dijadwalkan masuk bengkel — tidak akan jalan hari ini.';
  if (!route) return 'Belum ada trayek.';
  if (!driver) return 'Belum ada supir — bus tidak akan berangkat.';
  if (driver.stamina < STAMINA_TIRED_THRESHOLD)
    return `Stamina supir ${driver.stamina}/100 — tidak boleh menyetir. Istirahatkan atau ganti supir.`;
  if (bus.condition < CONDITION_BREAKDOWN_RISK)
    return `Kondisi ${bus.condition}% — risiko mogok 50%. Lebih aman service di Bengkel dulu.`;
  if (bus.condition < CONDITION_NEEDS_SERVICE)
    return `Kondisi ${bus.condition}% — sebaiknya servis sebelum trip panjang.`;
  return null;
}

function StatusPill({ bus, dispatchReady }) {
  if (bus.status === 'in_service') {
    return <span className="pill border-sky-400/40 bg-sky-500/15 text-sky-200">🛠️ Service</span>;
  }
  if (dispatchReady) {
    return <span className="pill border-emerald-400/40 bg-emerald-500/15 text-emerald-200">✓ Siap jalan</span>;
  }
  return <span className="pill border-white/15 bg-white/5 text-white/60">Standby</span>;
}

function CrewSlot({ kind, person, onAssign, onUnassign }) {
  const isDriver = kind === 'driver';
  const icon = isDriver ? '👨‍✈️' : '🧢';
  const title = isDriver ? 'Supir' : 'Kernet';

  if (!person) {
    return (
      <button
        onClick={onAssign}
        className="group flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-white/15 bg-black/15 px-3 py-2.5 text-left transition-colors hover:border-white/25 hover:bg-black/25"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg opacity-70">{icon}</span>
          <span className="text-xs text-white/60">
            {isDriver ? 'Belum ada supir' : 'Tanpa kernet'}
          </span>
        </span>
        <span className="text-[11px] font-semibold text-amber-300 group-hover:text-amber-200">
          + Pasang
        </span>
      </button>
    );
  }

  if (isDriver) {
    const skill = skillTier(person.skill);
    const stamina = staminaTier(person.stamina);
    return (
      <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span className="font-display text-xs font-bold text-white">{person.name}</span>
          </span>
          <span className={`pill ${skill.tone}`}>{skill.label}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className={`font-semibold ${stamina.tone}`}>
            Stamina {person.stamina}/100
          </span>
          <span className="flex gap-2">
            <button onClick={onAssign} className="text-amber-300 hover:underline">Ganti</button>
            <button onClick={onUnassign} className="text-white/55 hover:text-white">Lepas</button>
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-display text-xs font-bold text-white">{person.name}</span>
        </span>
        <span className="pill border-amber-400/30 bg-amber-500/10 text-amber-300">
          Charisma {person.charisma}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="text-white/55">Bonus penumpang gelap aktif</span>
        <span className="flex gap-2">
          <button onClick={onAssign} className="text-amber-300 hover:underline">Ganti</button>
          <button onClick={onUnassign} className="text-white/55 hover:text-white">Lepas</button>
        </span>
      </div>
    </div>
  );
}

function ConditionBar({ value }) {
  const pct = Math.max(0, Math.min(100, value));
  let color = 'bg-emerald-400';
  let label = 'Prima';
  if (pct < 70) { color = 'bg-amber-400'; label = 'Layak'; }
  if (pct < CONDITION_NEEDS_SERVICE) { color = 'bg-orange-400'; label = 'Perlu servis'; }
  if (pct < CONDITION_BREAKDOWN_RISK) { color = 'bg-rose-500'; label = 'Risiko mogok!'; }
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-white/55">Kondisi · {label}</span>
        <span className="font-semibold text-white">{pct}/100</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xs font-bold ${tone}`}>{value}</div>
    </div>
  );
}

// --- Route assignment modal ----------------------------------------------

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
    return previewTripEconomics({
      busType,
      distanceKm,
      strategyId: strategy,
      hasKernet: Boolean(bus.assignedKernet),
    });
  }, [validPair, busType, distanceKm, strategy, bus.assignedKernet]);

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
              <div className="font-display text-lg font-bold text-white">Atur Trayek</div>
              <div className="text-xs text-white/55">{bus.name} · {busType?.class}</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost text-sm">✕</button>
        </header>

        <div className="space-y-5 p-5">
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

          <RouteSummary fromId={fromId} toId={toId} distanceKm={distanceKm} validPair={validPair} />

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
                    <span className="font-display text-sm font-bold">{s.label}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">×{s.factor}</span>
                  </div>
                  <div className="mt-1 text-[11px] opacity-80">{s.description}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider opacity-60">
                    Okupansi: {Math.round(s.occupancy[0] * 100)}–{Math.round(s.occupancy[1] * 100)}%
                  </div>
                </button>
              ))}
            </div>
          </div>

          <PreviewBlock preview={preview} validPair={validPair} bus={bus} />
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/10 bg-black/20 p-4">
          <button onClick={onClose} className="btn-secondary">Batal</button>
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
    <select value={value} onChange={(e) => onChange(e.target.value)} className="field-input appearance-none">
      <option value="" className="bg-ink-900">— Pilih kota —</option>
      {CITIES.map((c) => (
        <option key={c.id} value={c.id} disabled={c.id === excludeId} className="bg-ink-900">
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
      <span className="ml-2 text-xs text-white/50">(dua arah identik)</span>
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
          <span className="pill border-rose-400/40 bg-rose-500/20 text-rose-200">⚠ Berisiko rugi</span>
        ) : (
          <span className="pill border-emerald-400/40 bg-emerald-500/20 text-emerald-200">✓ Cuan</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Tiket/kursi" value={formatIDR(preview.ticketPrice)} />
        <Stat label="BBM trip" value={formatIDR(preview.fuelCost)} tone="text-rose-300" />
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
        Estimasi belum termasuk gaji supir/kernet & dampak event jalanan.
      </p>
    </div>
  );
}

// --- Crew assignment modal ------------------------------------------------

function CrewModal({ busId, kind, onClose }) {
  const { state, assignDriver, assignKernet } = useGame();
  const isDriver = kind === 'driver';
  const bus = state.fleet.find((b) => b.id === busId);
  if (!bus) return null;
  const busType = getBusType(bus.class);

  const pool = isDriver ? state.drivers : state.kernets;
  const currentId = isDriver ? bus.assignedDriver : bus.assignedKernet;

  // Available = unassigned OR currently on this bus.
  const available = pool.filter(
    (p) => !p.assignedBus || p.assignedBus === bus.id
  );

  const handleSelect = (id) => {
    if (isDriver) assignDriver(busId, id);
    else assignKernet(busId, id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-xl overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div>
            <div className="font-display text-lg font-bold text-white">
              {isDriver ? 'Tunjuk Supir' : 'Tunjuk Kernet'}
            </div>
            <div className="text-xs text-white/55">
              {bus.name} · {busType?.class}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost text-sm">✕</button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {available.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-center text-sm text-white/60">
              {isDriver
                ? 'Tidak ada supir tersedia. Rekrut dulu di tab HR.'
                : 'Tidak ada kernet tersedia. Rekrut dulu di tab HR.'}
            </div>
          ) : (
            <div className="space-y-2">
              {available.map((p) =>
                isDriver ? (
                  <DriverPickRow
                    key={p.id}
                    driver={p}
                    selected={p.id === currentId}
                    onSelect={() => handleSelect(p.id)}
                  />
                ) : (
                  <KernetPickRow
                    key={p.id}
                    kernet={p}
                    selected={p.id === currentId}
                    onSelect={() => handleSelect(p.id)}
                  />
                )
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/10 bg-black/20 p-4">
          <button onClick={onClose} className="btn-secondary">Tutup</button>
        </footer>
      </div>
    </div>
  );
}

function DriverPickRow({ driver, selected, onSelect }) {
  const skill = skillTier(driver.skill);
  const stamina = staminaTier(driver.stamina);
  const tooTired = driver.stamina < STAMINA_TIRED_THRESHOLD;

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-amber-400/50 bg-amber-500/10'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
      }`}
    >
      <span className="text-2xl">👨‍✈️</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-bold text-white">{driver.name}</span>
          <span className={`pill ${skill.tone}`}>{skill.label}</span>
          {tooTired && (
            <span className="pill border-rose-400/40 bg-rose-500/15 text-rose-200">Lelah</span>
          )}
        </div>
        <div className="text-[11px] text-white/55">
          Skill {driver.skill}/10 · gaji {formatIDR(driver.salary)}/trip · <span className={stamina.tone}>Stamina {driver.stamina}/100</span>
        </div>
      </div>
      {selected && <span className="text-amber-300">✓</span>}
    </button>
  );
}

function KernetPickRow({ kernet, selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-amber-400/50 bg-amber-500/10'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
      }`}
    >
      <span className="text-2xl">🧢</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-bold text-white">{kernet.name}</span>
          <span className="pill border-amber-400/30 bg-amber-500/10 text-amber-300">
            Charisma {kernet.charisma}/10
          </span>
        </div>
        <div className="text-[11px] text-white/55">
          Gaji {formatIDR(kernet.salary)}/trip · bonus penumpang gelap
        </div>
      </div>
      {selected && <span className="text-amber-300">✓</span>}
    </button>
  );
}

// --- Sell modal -----------------------------------------------------------

function SellModal({ bus, onCancel, onConfirm }) {
  if (!bus) return null;
  const busType = getBusType(bus.class);
  const conditionFactor = (bus.condition ?? 100) / 100;
  const refund = Math.round((busType?.price ?? 0) * 0.6 * conditionFactor);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md p-6">
        <h3 className="font-display text-lg font-bold text-white">Jual bus?</h3>
        <p className="mt-1 text-sm text-white/60">
          {bus.name} ({busType?.class}) akan dijual ke pengepul. Trayek dan crew otomatis dilepas.
        </p>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
          <div className="flex justify-between text-white/60">
            <span>Harga unit baru</span>
            <span className="font-semibold text-white">{formatIDR(busType?.price ?? 0)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Kondisi saat ini</span>
            <span className="font-semibold text-white">{bus.condition}%</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Refund (60% × kondisi)</span>
            <span className="font-semibold text-emerald-300">{formatIDR(refund)}</span>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1">Batal</button>
          <button onClick={onConfirm} className="btn-danger flex-1">Ya, Jual</button>
        </div>
      </div>
    </div>
  );
}
