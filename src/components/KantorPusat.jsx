import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import {
  DRIVER_HIRE_COST,
  KERNET_HIRE_COST,
  STAMINA_MAX,
  STAMINA_FLOOR_TO_DRIVE,
  driverTripSalary,
  rollDriverCandidate,
  rollKernetCandidate,
} from '../data/staff';
import { formatIDR, formatNumber } from '../utils/format';

// Number of candidates shown in each rotating pool. Rerolled by the user.
const DRIVER_POOL_SIZE = 4;
const KERNET_POOL_SIZE = 3;

export default function KantorPusat({ onTabChange }) {
  const { state, hireDriver, fireDriver, hireKernet, fireKernet } = useGame();
  const [driverPool, setDriverPool] = useState(() =>
    Array.from({ length: DRIVER_POOL_SIZE }, () => ({
      ...rollDriverCandidate(),
      key: Math.random(),
    }))
  );
  const [kernetPool, setKernetPool] = useState(() =>
    Array.from({ length: KERNET_POOL_SIZE }, () => ({
      ...rollKernetCandidate(),
      key: Math.random(),
    }))
  );

  // Keep pools fresh: if a candidate is hired we already remove it; this
  // is just a safety so the UI always has something to show.
  useEffect(() => {
    if (driverPool.length === 0) {
      setDriverPool(
        Array.from({ length: DRIVER_POOL_SIZE }, () => ({
          ...rollDriverCandidate(),
          key: Math.random(),
        }))
      );
    }
  }, [driverPool.length]);

  const handleHireDriver = (candidate) => {
    if (state.balance < DRIVER_HIRE_COST) return;
    hireDriver(candidate);
    setDriverPool((p) => [
      ...p.filter((c) => c.key !== candidate.key),
      { ...rollDriverCandidate(), key: Math.random() },
    ]);
  };

  const handleHireKernet = (candidate) => {
    if (state.balance < KERNET_HIRE_COST) return;
    hireKernet(candidate);
    setKernetPool((p) => [
      ...p.filter((c) => c.key !== candidate.key),
      { ...rollKernetCandidate(), key: Math.random() },
    ]);
  };

  const refreshDriverPool = () => {
    setDriverPool(
      Array.from({ length: DRIVER_POOL_SIZE }, () => ({
        ...rollDriverCandidate(),
        key: Math.random(),
      }))
    );
  };
  const refreshKernetPool = () => {
    setKernetPool(
      Array.from({ length: KERNET_POOL_SIZE }, () => ({
        ...rollKernetCandidate(),
        key: Math.random(),
      }))
    );
  };

  return (
    <div className="space-y-6">
      <section className="glass-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            🏢 Kantor Pusat — HR
          </h2>
          <p className="text-sm text-white/60">
            Rekrut Supir & Kernet di sini. Bus tanpa supir tidak bisa diberangkatkan.
          </p>
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

      {/* Drivers */}
      <Section
        title="Supir (Driver)"
        subtitle={`${state.drivers.length} terdaftar · biaya rekrut ${formatIDR(DRIVER_HIRE_COST)}`}
        onRefresh={refreshDriverPool}
        refreshLabel="Ganti kandidat"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {driverPool.map((c) => (
            <DriverCandidateCard
              key={c.key}
              candidate={c}
              canAfford={state.balance >= DRIVER_HIRE_COST}
              onHire={() => handleHireDriver(c)}
            />
          ))}
        </div>
      </Section>

      <RosterSection
        title="Daftar Supir Kerja"
        emptyHint="Belum ada supir. Rekrut salah satu kandidat di atas dulu."
        items={state.drivers}
        renderItem={(d) => (
          <DriverRosterRow
            key={d.id}
            driver={d}
            assignedBus={state.fleet.find((b) => b.id === d.assignedBusId)}
            onFire={() => fireDriver(d.id)}
          />
        )}
      />

      {/* Kernets */}
      <Section
        title="Kernet (Co-Driver)"
        subtitle={`${state.kernets.length} terdaftar · biaya rekrut ${formatIDR(KERNET_HIRE_COST)} · bonus penumpang gelap +Rp 250.000/trip`}
        onRefresh={refreshKernetPool}
        refreshLabel="Ganti kandidat"
      >
        <div className="grid gap-3 md:grid-cols-3">
          {kernetPool.map((c) => (
            <KernetCandidateCard
              key={c.key}
              candidate={c}
              canAfford={state.balance >= KERNET_HIRE_COST}
              onHire={() => handleHireKernet(c)}
            />
          ))}
        </div>
      </Section>

      <RosterSection
        title="Daftar Kernet Kerja"
        emptyHint="Belum ada kernet. Kernet itu opsional tapi cuan tambahan."
        items={state.kernets}
        renderItem={(k) => (
          <KernetRosterRow
            key={k.id}
            kernet={k}
            assignedBus={state.fleet.find((b) => b.id === k.assignedBusId)}
            onFire={() => fireKernet(k.id)}
          />
        )}
      />
    </div>
  );
}

// ---- Layout helpers ------------------------------------------------------

function Section({ title, subtitle, onRefresh, refreshLabel, children }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-white/50">{subtitle}</p>}
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="btn-ghost text-xs">
            🔄 {refreshLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function RosterSection({ title, emptyHint, items, renderItem }) {
  return (
    <Section title={title} subtitle={`${items.length} aktif`}>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-black/15 px-4 py-5 text-sm text-white/55">
          {emptyHint}
        </div>
      ) : (
        <div className="grid gap-2">{items.map(renderItem)}</div>
      )}
    </Section>
  );
}

// ---- Candidate / roster cards -------------------------------------------

function DriverCandidateCard({ candidate, canAfford, onHire }) {
  const { name, skill, salary } = candidate;
  const tier = tierForSkill(skill);
  return (
    <article className={`glass-card p-4 bg-gradient-to-br ${tier.accent}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-sm font-bold text-white">{name}</div>
          <div className="text-[11px] text-white/60">Calon Supir · {tier.label}</div>
        </div>
        <SkillStars skill={skill} />
      </header>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Stat label="Skill" value={`${skill}/10`} tone={tier.text} />
        <Stat label="Stamina" value={`${STAMINA_MAX}/100`} tone="text-emerald-300" />
        <Stat label="Gaji/trip" value={formatIDR(salary)} tone="text-white" />
        <Stat label="Sign-on" value={formatIDR(DRIVER_HIRE_COST)} tone="text-amber-300" />
      </div>
      <button
        onClick={onHire}
        disabled={!canAfford}
        className="btn-primary mt-3 w-full text-sm"
      >
        {canAfford ? 'Rekrut' : 'Saldo kurang'}
      </button>
    </article>
  );
}

function KernetCandidateCard({ candidate, canAfford, onHire }) {
  return (
    <article className="glass-card p-4 bg-gradient-to-br from-orange-500/15 to-orange-500/5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-sm font-bold text-white">
            {candidate.name}
          </div>
          <div className="text-[11px] text-white/60">Calon Kernet</div>
        </div>
        <span className="pill border-orange-400/40 bg-orange-500/15 text-orange-200">
          🎫 Penumpang Gelap
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Stat label="Gaji/trip" value={formatIDR(candidate.salary)} />
        <Stat label="Sign-on" value={formatIDR(KERNET_HIRE_COST)} tone="text-amber-300" />
      </div>
      <p className="mt-2 text-[11px] text-white/50">
        Bonus +Rp 250.000/trip, tapi kondisi bus melemah ~15% lebih cepat.
      </p>
      <button
        onClick={onHire}
        disabled={!canAfford}
        className="btn-secondary mt-3 w-full text-sm"
      >
        {canAfford ? 'Rekrut' : 'Saldo kurang'}
      </button>
    </article>
  );
}

function DriverRosterRow({ driver, assignedBus, onFire }) {
  const tier = tierForSkill(driver.skill);
  const stamina = driver.stamina ?? 0;
  const tooTired = stamina < STAMINA_FLOOR_TO_DRIVE;

  return (
    <div className="grid items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
      <div>
        <div className="font-display text-sm font-bold text-white">
          {driver.name}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/55">
          <span className={`pill ${tier.pill}`}>{tier.label}</span>
          <span>Skill {driver.skill}/10</span>
          <span>· Gaji {formatIDR(driverTripSalary(driver.skill))}/trip</span>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/45">Stamina</div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full ${tooTired ? 'bg-rose-400' : stamina < 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${stamina}%` }}
          />
        </div>
        <div className={`mt-1 text-[11px] ${tooTired ? 'text-rose-300' : 'text-white/60'}`}>
          {stamina}/100 {tooTired && '· terlalu lelah'}
        </div>
      </div>
      <div className="text-[12px] text-white/70">
        {assignedBus ? (
          <>
            <div className="text-[10px] uppercase tracking-wider text-white/45">Bertugas di</div>
            <div className="font-semibold text-white">{assignedBus.name}</div>
          </>
        ) : (
          <span className="pill border-white/10 bg-white/5 text-white/55">Standby</span>
        )}
      </div>
      <button onClick={onFire} className="btn-ghost text-xs text-rose-300/80 hover:text-rose-200">
        Pecat
      </button>
    </div>
  );
}

function KernetRosterRow({ kernet, assignedBus, onFire }) {
  return (
    <div className="grid items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3 sm:grid-cols-[1.2fr_1fr_auto]">
      <div>
        <div className="font-display text-sm font-bold text-white">{kernet.name}</div>
        <div className="text-[11px] text-white/55">
          Kernet · gaji {formatIDR(kernet.salary)}/trip
        </div>
      </div>
      <div className="text-[12px] text-white/70">
        {assignedBus ? (
          <>
            <div className="text-[10px] uppercase tracking-wider text-white/45">Bertugas di</div>
            <div className="font-semibold text-white">{assignedBus.name}</div>
          </>
        ) : (
          <span className="pill border-white/10 bg-white/5 text-white/55">Standby</span>
        )}
      </div>
      <button onClick={onFire} className="btn-ghost text-xs text-rose-300/80 hover:text-rose-200">
        Pecat
      </button>
    </div>
  );
}

// ---- Tiny atoms ----------------------------------------------------------

function Stat({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xs font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function SkillStars({ skill }) {
  // Map 1-10 onto 5 stars.
  const filled = Math.max(1, Math.min(5, Math.round(skill / 2)));
  return (
    <div className="text-sm leading-none text-amber-300">
      {'★'.repeat(filled)}
      <span className="text-white/20">{'★'.repeat(5 - filled)}</span>
    </div>
  );
}

function tierForSkill(skill) {
  if (skill >= 8) {
    return {
      label: 'Veteran Pantura',
      accent: 'from-amber-500/20 to-amber-500/5',
      text: 'text-amber-300',
      pill: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
    };
  }
  if (skill >= 6) {
    return {
      label: 'Pengalaman',
      accent: 'from-sky-500/20 to-sky-500/5',
      text: 'text-sky-300',
      pill: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
    };
  }
  return {
    label: 'Pemula',
    accent: 'from-emerald-500/15 to-emerald-500/5',
    text: 'text-emerald-300',
    pill: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  };
}
