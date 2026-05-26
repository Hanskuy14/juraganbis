import { useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import {
  ENGINE_OPTIMAL_TEMP,
  ENGINE_REDLINE_TEMP,
  ENGINE_WARN_TEMP,
} from '../utils/telemetry';
import { formatNumber } from '../utils/format';

// Wall-clock tick rate. 250 ms ≈ 1 simulated trip-hour. A 700 km route
// (~12 in-game hours) wraps in ~3 seconds — fast enough to feel snappy
// but slow enough that the heat-spike drama is readable.
const TICK_MS = 250;

export default function TelemetryModal() {
  const { state, tickTelemetry, finalizeTelemetry } = useGame();
  const session = state.activeTrip;

  const intervalRef = useRef(null);

  // Drive the simulation: while status === 'running', fire TICK_TELEMETRY
  // every TICK_MS. Stop the interval once everything is settled (or the
  // modal unmounts).
  useEffect(() => {
    if (!session) return undefined;
    if (session.status !== 'running') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return undefined;
    }
    intervalRef.current = setInterval(() => {
      tickTelemetry();
    }, TICK_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [session, tickTelemetry]);

  if (!session) return null;

  const { frames, status, event, idleRows } = session;
  const settled = status === 'settled';
  const breakdowns = frames.filter((f) => f.breakdown).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="glass-panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
        <header className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-amber-500/15 via-transparent to-rose-500/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="pill border-amber-400/30 bg-amber-500/15 text-amber-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                LIVE TELEMETRY · Hari ke-{state.day}
              </span>
              <h3 className="mt-2 font-display text-xl font-extrabold text-white sm:text-2xl">
                {settled ? 'Semua armada sudah sampai tujuan' : 'Armada di jalan...'}
              </h3>
              <p className="mt-1 text-sm text-white/65">
                {frames.length} bus dipantau · {idleRows.length} bus istirahat
                {breakdowns > 0 && (
                  <span className="ml-2 text-rose-300">· {breakdowns}× MOGOK</span>
                )}
              </p>
            </div>
            {settled && (
              <span className="pill border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
                ✓ Selesai
              </span>
            )}
          </div>

          {event && <EventBanner event={event} />}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {frames.map((frame) => (
            <BusTelemetryRow key={frame.busId} frame={frame} />
          ))}

          {idleRows.length > 0 && (
            <section className="mt-2">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/55">
                Bus tidak berangkat ({idleRows.length})
              </h4>
              <div className="space-y-1.5">
                {idleRows.map((row) => (
                  <div
                    key={row.busId}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm"
                  >
                    <span className="text-white/75">{row.busName}</span>
                    <span className="pill border-white/10 bg-white/5 text-white/60">
                      {row.idleLabel ?? row.idleReason}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/30 p-4">
          <p className="text-[11px] text-white/50">
            {settled
              ? 'Tekan tombol untuk lihat laporan keuangan harian.'
              : 'Tunggu sampai semua bus selesai trip-nya...'}
          </p>
          <button
            onClick={finalizeTelemetry}
            disabled={!settled}
            className="btn-primary"
          >
            Lihat Laporan Harian →
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---- Per-bus telemetry row ----------------------------------------------

function BusTelemetryRow({ frame }) {
  const progressPct = Math.min(100, Math.round((frame.progressKm / frame.totalKm) * 100));
  const tempStatus = tempBucket(frame.engineTemp);
  const tireStatus = tireBucket(frame.tireWear, frame.tiresRequired);
  const fuelPct = frame.fuelStarted > 0
    ? Math.max(0, Math.round((frame.fuelRemaining / frame.fuelStarted) * 100))
    : 0;

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border p-4 transition-colors ${
        frame.breakdown
          ? 'border-rose-400/40 bg-rose-500/10'
          : frame.complete
          ? 'border-emerald-400/30 bg-emerald-500/5'
          : 'border-white/10 bg-black/30'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-sm font-bold text-white">
            {frame.busName}{' '}
            <span className="text-[10px] font-medium text-white/55">
              · {frame.busClass} · supir {frame.driverName ?? '—'}
            </span>
          </div>
          <div className="text-[12px] text-white/60">{frame.routeLabel}</div>
        </div>
        <StatusBadge frame={frame} />
      </header>

      {/* Progress */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/45">
          <span>Jarak tempuh</span>
          <span>
            {formatNumber(frame.progressKm)}/{formatNumber(frame.totalKm)} km · {progressPct}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
              frame.breakdown ? 'bg-rose-400' : frame.complete ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Live telemetry vars */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Gauge
          label="Suhu Mesin"
          value={`${Math.round(frame.engineTemp)}°C`}
          tone={tempStatus.tone}
          bar={tempStatus.bar}
          fill={Math.min(100, ((frame.engineTemp - 60) / (ENGINE_REDLINE_TEMP + 15 - 60)) * 100)}
          hint={tempStatus.hint}
        />
        <Gauge
          label="Ban (kondisi)"
          value={`${Math.round(frame.tireWear)}%`}
          tone={tireStatus.tone}
          bar={tireStatus.bar}
          fill={frame.tireWear}
          hint={
            frame.tiresRequired > 0
              ? `${frame.tiresRequired} ban dipakai`
              : 'Tanpa ban cadangan'
          }
        />
        <Gauge
          label="Solar Tersisa"
          value={`${Math.round(frame.fuelRemaining)}L`}
          tone={fuelPct < 15 ? 'text-rose-300' : fuelPct < 40 ? 'text-amber-300' : 'text-emerald-300'}
          bar={fuelPct < 15 ? 'bg-rose-400' : fuelPct < 40 ? 'bg-amber-400' : 'bg-emerald-400'}
          fill={fuelPct}
          hint={`Berangkat dgn ${frame.fuelStarted}L`}
        />
      </div>

      {/* Footer detail row */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/55">
        <span>Hari trip ke-{frame.elapsedHours}/{frame.totalHours}</span>
        <span>· Kondisi awal {frame.conditionStart}%</span>
        {frame.kernetName && <span className="text-orange-300">· Kernet {frame.kernetName}</span>}
        {frame.partsRequired > 0 && (
          <span>· {frame.partsRequired} suku cadang dipakai</span>
        )}
      </div>

      {frame.breakdown && (
        <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
          <span className="font-semibold uppercase tracking-wider">
            {frame.breakdownReason === 'overheat' ? '🔥 OVERHEAT' : '💥 BAN MELEDAK'}
          </span>{' '}
          — Trip dibatalkan, pendapatan 0, denda perbaikan akan dibebankan.
        </div>
      )}
    </article>
  );
}

function StatusBadge({ frame }) {
  if (frame.breakdown) {
    return (
      <span className="pill border-rose-400/50 bg-rose-500/20 text-rose-100">
        🛠 MOGOK
      </span>
    );
  }
  if (frame.complete) {
    return (
      <span className="pill border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
        ✓ Sampai
      </span>
    );
  }
  return (
    <span className="pill border-amber-400/40 bg-amber-500/15 text-amber-200">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      Di jalan
    </span>
  );
}

// Reusable gauge: label, value text, percentage bar.
function Gauge({ label, value, tone, bar, fill, hint }) {
  const pct = Math.max(0, Math.min(100, fill));
  return (
    <div className="rounded-xl border border-white/5 bg-black/35 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full transition-[width] duration-200 ease-linear ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-white/40">{hint}</div>}
    </div>
  );
}

function tempBucket(temp) {
  if (temp >= ENGINE_REDLINE_TEMP) {
    return {
      tone: 'text-rose-300',
      bar: 'bg-rose-500',
      hint: 'RED ZONE',
    };
  }
  if (temp >= ENGINE_WARN_TEMP) {
    return {
      tone: 'text-amber-300',
      bar: 'bg-amber-400',
      hint: 'Tinggi',
    };
  }
  if (temp >= ENGINE_OPTIMAL_TEMP - 5 && temp <= ENGINE_OPTIMAL_TEMP + 5) {
    return {
      tone: 'text-emerald-300',
      bar: 'bg-emerald-400',
      hint: 'Optimal',
    };
  }
  return {
    tone: 'text-sky-300',
    bar: 'bg-sky-400',
    hint: 'Normal',
  };
}

function tireBucket(wear, required) {
  if (required === 0) {
    return { tone: 'text-white/65', bar: 'bg-white/30' };
  }
  if (wear < 15) {
    return { tone: 'text-rose-300', bar: 'bg-rose-400' };
  }
  if (wear < 35) {
    return { tone: 'text-amber-300', bar: 'bg-amber-400' };
  }
  return { tone: 'text-emerald-300', bar: 'bg-emerald-400' };
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
        <span className="font-semibold uppercase tracking-wider opacity-80">Kejadian:</span>
        <span className="font-bold">{event.title}</span>
      </div>
      {choiceLabel && (
        <div className="mt-0.5 text-[11px] opacity-80">{choiceLabel}</div>
      )}
    </div>
  );
}
