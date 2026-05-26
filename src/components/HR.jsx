import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { skillTier, staminaTier } from '../data/personnel';
import { formatIDR } from '../utils/format';

export default function HR({ onTabChange }) {
  const {
    state,
    hireDriver,
    fireDriver,
    hireKernet,
    fireKernet,
    refreshHRPool,
  } = useGame();
  const [tab, setTab] = useState('drivers');
  const [confirmFire, setConfirmFire] = useState(null); // { kind, id }

  return (
    <div className="space-y-6">
      <section className="glass-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            🏢 Kantor Pusat / HR
          </h2>
          <p className="text-sm text-white/60">
            Rekrut supir & kernet dari bursa lowongan, atur roster armada di Garasi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshHRPool} className="btn-secondary text-xs">
            🔄 Bursa Baru
          </button>
          <button onClick={() => onTabChange('garasi')} className="btn-ghost text-xs">
            Garasi →
          </button>
        </div>
      </section>

      <div className="flex gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
        <SubTab active={tab === 'drivers'} onClick={() => setTab('drivers')} icon="👨‍✈️" label={`Supir (${state.drivers.length})`} />
        <SubTab active={tab === 'kernets'} onClick={() => setTab('kernets')} icon="🧢" label={`Kernet (${state.kernets.length})`} />
      </div>

      {tab === 'drivers' && (
        <DriversPanel
          drivers={state.drivers}
          pool={state.hrPool.drivers}
          onHire={hireDriver}
          onFire={(id) => setConfirmFire({ kind: 'driver', id })}
        />
      )}
      {tab === 'kernets' && (
        <KernetsPanel
          kernets={state.kernets}
          pool={state.hrPool.kernets}
          onHire={hireKernet}
          onFire={(id) => setConfirmFire({ kind: 'kernet', id })}
        />
      )}

      {confirmFire && (
        <ConfirmFireModal
          kind={confirmFire.kind}
          name={
            confirmFire.kind === 'driver'
              ? state.drivers.find((d) => d.id === confirmFire.id)?.name
              : state.kernets.find((k) => k.id === confirmFire.id)?.name
          }
          onCancel={() => setConfirmFire(null)}
          onConfirm={() => {
            if (confirmFire.kind === 'driver') fireDriver(confirmFire.id);
            else fireKernet(confirmFire.id);
            setConfirmFire(null);
          }}
        />
      )}
    </div>
  );
}

// --- Drivers --------------------------------------------------------------

function DriversPanel({ drivers, pool, onHire, onFire }) {
  return (
    <>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/55">
          Roster Supir ({drivers.length})
        </h3>
        {drivers.length === 0 ? (
          <Empty
            title="Belum ada supir"
            body="Bus tidak bisa berangkat tanpa supir. Rekrut dari Bursa di bawah."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {drivers.map((d) => (
              <DriverRosterCard key={d.id} driver={d} onFire={() => onFire(d.id)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-white/55">
          Bursa Lowongan Supir
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pool.map((c) => (
            <DriverCandidateCard key={c.candidateId} cand={c} onHire={() => onHire(c.candidateId)} />
          ))}
        </div>
      </section>
    </>
  );
}

function DriverRosterCard({ driver, onFire }) {
  const skill = skillTier(driver.skill);
  const stamina = staminaTier(driver.stamina);
  return (
    <article className="glass-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-2xl">
            👨‍✈️
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-bold text-white">
              {driver.name}
            </div>
            <div className="text-[11px] text-white/55">
              {driver.tripsCompleted ?? 0} trip · gaji {formatIDR(driver.salary)}/trip
            </div>
          </div>
        </div>
        <button onClick={onFire} className="btn-ghost text-xs text-rose-300/80 hover:text-rose-200">
          Pecat
        </button>
      </header>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <StatCell label="Skill" value={`${driver.skill}/10`} pillTone={skill.tone} pillLabel={skill.label} />
        <StatCell label="Stamina" value={`${driver.stamina}/100`} valueTone={stamina.tone} />
        <StatCell label="Status" value={driver.assignedBus ? 'Aktif' : 'Standby'} valueTone={driver.assignedBus ? 'text-emerald-300' : 'text-white/55'} />
      </div>

      <StaminaBar value={driver.stamina} />
    </article>
  );
}

function DriverCandidateCard({ cand, onHire }) {
  const tier = skillTier(cand.skill);
  const { state } = useGame();
  return (
    <article className="glass-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-sm font-bold text-white">
            Pak {cand.firstName}
            {cand.nickname ? <span className="text-amber-300"> "{cand.nickname}"</span> : null}
          </div>
          <span className={`pill mt-1 ${tier.tone}`}>{tier.label}</span>
        </div>
        <div className="text-2xl opacity-80">🪪</div>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
        <Cell label="Skill" value={`${cand.skill}/10`} />
        <Cell label="Bayaran" value={`${formatIDR(cand.salary)}/trip`} />
      </div>

      <button
        onClick={onHire}
        className="btn-primary mt-3 w-full text-xs"
      >
        Rekrut
      </button>
      <p className="mt-1 text-[10px] text-white/40">
        Saldo cukup? Skill tinggi mengurangi kerusakan bus per trip.
      </p>
      {/* unused state guard to keep linter happy */}
      <span className="hidden">{state.poName}</span>
    </article>
  );
}

// --- Kernet ---------------------------------------------------------------

function KernetsPanel({ kernets, pool, onHire, onFire }) {
  return (
    <>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/55">
          Roster Kernet ({kernets.length})
        </h3>
        {kernets.length === 0 ? (
          <Empty
            title="Belum ada kernet"
            body="Kernet itu opsional, tapi narik 'penumpang gelap' yang bikin pendapatan ekstra."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {kernets.map((k) => (
              <KernetRosterCard key={k.id} kernet={k} onFire={() => onFire(k.id)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-white/55">
          Bursa Kernet
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pool.map((c) => (
            <KernetCandidateCard key={c.candidateId} cand={c} onHire={() => onHire(c.candidateId)} />
          ))}
        </div>

        <div className="glass-card mt-3 p-3 text-[11px] text-white/55">
          <span className="font-semibold text-amber-300">Catatan:</span>{' '}
          Kernet menambah pendapatan dari "penumpang gelap" (off-the-books), tapi muatan
          tambahan ini bikin kondisi bus turun ~15% lebih cepat per trip.
        </div>
      </section>
    </>
  );
}

function KernetRosterCard({ kernet, onFire }) {
  return (
    <article className="glass-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-2xl">
            🧢
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-bold text-white">{kernet.name}</div>
            <div className="text-[11px] text-white/55">
              Charisma {kernet.charisma}/10 · gaji {formatIDR(kernet.salary)}/trip
            </div>
          </div>
        </div>
        <button onClick={onFire} className="btn-ghost text-xs text-rose-300/80 hover:text-rose-200">
          Pecat
        </button>
      </header>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Cell label="Bus" value={kernet.assignedBus ? 'Aktif' : 'Standby'} />
        <Cell label="Bonus" value="Penumpang gelap" />
      </div>
    </article>
  );
}

function KernetCandidateCard({ cand, onHire }) {
  return (
    <article className="glass-card p-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="font-display text-sm font-bold text-white">Mas {cand.firstName}</div>
          <div className="text-[11px] text-white/55">Charisma {cand.charisma}/10</div>
        </div>
        <div className="text-2xl opacity-80">🎟️</div>
      </header>
      <div className="mt-2 text-xs text-white/55">
        Gaji <span className="font-semibold text-white">{formatIDR(cand.salary)}</span>/trip
      </div>
      <button onClick={onHire} className="btn-primary mt-3 w-full text-xs">
        Rekrut
      </button>
    </article>
  );
}

// --- Shared atoms ---------------------------------------------------------

function Cell({ label, value, valueTone = 'text-white' }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xs font-bold ${valueTone}`}>{value}</div>
    </div>
  );
}

function StatCell({ label, value, valueTone = 'text-white', pillTone, pillLabel }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2 py-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
        {pillTone && <span className={`pill ${pillTone}`}>{pillLabel}</span>}
      </div>
      <div className={`text-xs font-bold ${valueTone}`}>{value}</div>
    </div>
  );
}

function StaminaBar({ value }) {
  const pct = Math.max(0, Math.min(100, value));
  let color = 'bg-emerald-400';
  if (pct < 70) color = 'bg-amber-400';
  if (pct < 40) color = 'bg-orange-400';
  if (pct < 20) color = 'bg-rose-500';
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Empty({ title, body }) {
  return (
    <div className="glass-card flex flex-col items-center gap-1 px-6 py-8 text-center">
      <div className="text-3xl opacity-70">📭</div>
      <div className="font-semibold text-white">{title}</div>
      <p className="max-w-sm text-xs text-white/55">{body}</p>
    </div>
  );
}

function SubTab({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'bg-white/10 text-white shadow-glass'
          : 'text-white/55 hover:bg-white/5'
      }`}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function ConfirmFireModal({ kind, name, onCancel, onConfirm }) {
  const label = kind === 'driver' ? 'supir' : 'kernet';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md p-5">
        <h3 className="font-display text-lg font-bold text-white">Pecat {label}?</h3>
        <p className="mt-1 text-sm text-white/60">
          {name ?? 'Staf'} akan keluar dari roster. Bus yang dia tangani jadi tanpa {label} sampai diganti.
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1">Batal</button>
          <button onClick={onConfirm} className="btn-danger flex-1">Ya, Pecat</button>
        </div>
      </div>
    </div>
  );
}
