import { useGame } from '../context/GameContext';
import { formatNumber } from '../utils/format';

export default function Leaderboard({ onTabChange }) {
  const { state, ranking, REPUTATION_MAX } = useGame();
  const playerEntry = ranking.find((e) => e.isPlayer);

  return (
    <div className="space-y-6">
      <section className="glass-panel relative overflow-hidden p-5 sm:p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="pill border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300">
              Persaingan PO Pulau Jawa
            </span>
            <h2 className="mt-2 font-display text-2xl font-extrabold text-white">
              🏆 Leaderboard Reputasi
            </h2>
            <p className="mt-1 max-w-xl text-sm text-white/60">
              Skor = <span className="text-white">Reputasi</span> +{' '}
              <span className="text-white">jumlah armada × 25</span>. Capai{' '}
              <span className="text-amber-300">Rank #1</span> dengan reputasi ≥ 950 dan minimal 5 unit
              untuk memenangkan game.
            </p>
          </div>
          <PlayerSummary entry={playerEntry} state={state} repMax={REPUTATION_MAX} />
        </div>
      </section>

      <ReputationGauge value={state.reputation} max={REPUTATION_MAX} />

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h3 className="font-display text-lg font-bold text-white">Klasemen</h3>
          <button onClick={() => onTabChange('dashboard')} className="btn-ghost text-xs">
            ← Dashboard
          </button>
        </div>

        <div className="space-y-2">
          {ranking.map((entry) => (
            <RankRow key={entry.id} entry={entry} repMax={REPUTATION_MAX} />
          ))}
        </div>
      </section>

      <section className="glass-panel p-5 text-xs text-white/60">
        <h4 className="font-display text-sm font-bold text-white">Tips naik peringkat</h4>
        <ul className="mt-2 space-y-1.5">
          <li>🔹 Konsisten isi penumpang. Okupansi tinggi = reputasi naik tiap berangkat.</li>
          <li>🔹 Hindari mogok: servis bus sebelum kondisi {'<'} 20%.</li>
          <li>🔹 Beli unit Patas / Sleeper untuk lonjakan reputasi.</li>
          <li>🔹 Pilih solusi razia secara legal (tolak suap) untuk bonus reputasi besar.</li>
          <li>🔹 Hindari tarif "Mahal" di trayek sepi — tiket selangit + bus kosong = reputasi anjlok.</li>
        </ul>
      </section>
    </div>
  );
}

function PlayerSummary({ entry, state, repMax }) {
  if (!entry) return null;
  const rankColor =
    entry.rank === 1
      ? 'text-amber-300'
      : entry.rank <= 3
      ? 'text-sky-300'
      : 'text-white/85';
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-right">
      <div className="text-[10px] uppercase tracking-wider text-white/50">Posisimu</div>
      <div className={`font-display text-2xl font-extrabold ${rankColor}`}>
        Rank #{entry.rank}
      </div>
      <div className="mt-0.5 text-[11px] text-white/55">
        Rep {state.reputation}/{repMax} · {state.fleet.length} unit
      </div>
    </div>
  );
}

function ReputationGauge({ value, max }) {
  const ratio = Math.min(1, Math.max(0, value / max));
  const tier = reputationTier(value);
  return (
    <section className="glass-panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/50">
            Reputasi PO
          </div>
          <div className="font-display text-2xl font-extrabold text-white">
            {value} <span className="text-white/45 text-base">/ {max}</span>
          </div>
        </div>
        <span className={`pill ${tier.pill}`}>{tier.label}</span>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full ${tier.bar}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-white/45">
        <span>Pemula</span>
        <span>Andalan</span>
        <span>Pesaing Berat</span>
        <span>Raja Pantura</span>
      </div>
    </section>
  );
}

function RankRow({ entry, repMax }) {
  const rankColors =
    entry.rank === 1
      ? 'from-amber-500/20 to-amber-500/5 border-amber-400/40'
      : entry.rank === 2
      ? 'from-slate-200/15 to-slate-200/5 border-slate-300/30'
      : entry.rank === 3
      ? 'from-orange-500/15 to-orange-500/5 border-orange-400/30'
      : 'from-white/5 to-white/0 border-white/10';

  const ratio = Math.min(1, Math.max(0, entry.reputation / repMax));
  const tier = reputationTier(entry.reputation);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-r ${rankColors} ${
        entry.isPlayer ? 'ring-2 ring-amber-400/40' : ''
      }`}
    >
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-display font-extrabold ${
            entry.rank === 1
              ? 'bg-amber-500/20 text-amber-200'
              : entry.rank === 2
              ? 'bg-slate-200/15 text-slate-100'
              : entry.rank === 3
              ? 'bg-orange-500/20 text-orange-200'
              : 'bg-black/30 text-white/70'
          }`}
        >
          #{entry.rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold text-white truncate">
              {entry.name}
            </span>
            {entry.isPlayer ? (
              <span className="pill border-amber-400/40 bg-amber-500/15 text-amber-200">
                Kamu
              </span>
            ) : (
              <span className="pill border-white/10 bg-white/5 text-white/55">AI</span>
            )}
            <span className={`pill ${tier.pill}`}>{tier.label}</span>
          </div>
          {entry.blurb && (
            <div className="mt-0.5 truncate text-[11px] text-white/55">{entry.blurb}</div>
          )}
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${tier.bar}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-[10px] uppercase tracking-wider text-white/45">Reputasi</div>
          <div className="font-display text-lg font-bold text-white">
            {formatNumber(entry.reputation)}
          </div>
          <div className="text-[11px] text-white/55">{entry.fleet} unit</div>
        </div>
        <div className="text-right sm:hidden">
          <div className="font-display text-sm font-bold text-white">
            {formatNumber(entry.reputation)}
          </div>
          <div className="text-[10px] text-white/55">{entry.fleet} unit</div>
        </div>
      </div>
    </div>
  );
}

function reputationTier(value) {
  if (value >= 900) {
    return {
      label: 'Raja Pantura',
      pill: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
      bar: 'bg-amber-400',
    };
  }
  if (value >= 700) {
    return {
      label: 'Pesaing Berat',
      pill: 'border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200',
      bar: 'bg-fuchsia-400',
    };
  }
  if (value >= 400) {
    return {
      label: 'Andalan',
      pill: 'border-sky-400/40 bg-sky-500/15 text-sky-200',
      bar: 'bg-sky-400',
    };
  }
  if (value >= 200) {
    return {
      label: 'Berkembang',
      pill: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
      bar: 'bg-emerald-400',
    };
  }
  return {
    label: 'Pemula',
    pill: 'border-white/15 bg-white/5 text-white/70',
    bar: 'bg-white/40',
  };
}
