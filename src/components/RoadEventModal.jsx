import { useGame } from '../context/GameContext';

// Renders the per-day "kejadian di jalan" pop-up. Some events are
// informational ("acknowledge"), some require a binary choice that changes
// the dispatch outcome.
export default function RoadEventModal() {
  const { state, resolveEvent } = useGame();
  const event = state.pendingEvent;
  if (!event) return null;

  const accent = accentFor(event.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-lg overflow-hidden">
        <header className={`relative overflow-hidden border-b border-white/10 p-5 ${accent.header}`}>
          <span className={`pill ${accent.pill}`}>Kejadian di Jalan · Hari ke-{state.day}</span>
          <div className="mt-3 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-black/40 text-3xl">
              {event.icon}
            </div>
            <h3 className="font-display text-xl font-extrabold text-white">
              {event.title}
            </h3>
          </div>
          <p className="mt-3 text-sm text-white/75">{event.description}</p>
          {event.effect && (
            <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${accent.effect}`}>
              <span className="font-semibold uppercase tracking-wider opacity-80">Efek</span>
              <div className="mt-0.5 text-sm text-white/85">{event.effect}</div>
            </div>
          )}
        </header>

        <div className="space-y-2 p-5">
          {event.requiresChoice ? (
            event.choices.map((choice) => (
              <button
                key={choice.id}
                onClick={() => resolveEvent(choice.id)}
                className={`${choice.tone ?? 'btn-secondary'} w-full justify-between !py-3.5`}
              >
                <span className="text-left">
                  <span className="block font-display text-sm font-bold">
                    {choice.label}
                  </span>
                  {choice.summary && (
                    <span className="mt-0.5 block text-[11px] font-normal opacity-75">
                      {choice.summary}
                    </span>
                  )}
                </span>
                <span aria-hidden className="text-base">→</span>
              </button>
            ))
          ) : (
            <button
              onClick={() => resolveEvent(null)}
              className="btn-primary w-full !py-3.5"
            >
              Lanjutkan Perjalanan
            </button>
          )}
        </div>

        <footer className="border-t border-white/10 bg-black/20 p-3 text-center text-[11px] text-white/45">
          Pilihan langsung dieksekusi pada laporan harian malam ini.
        </footer>
      </div>
    </div>
  );
}

function accentFor(id) {
  switch (id) {
    case 'razia':
      return {
        header: 'bg-gradient-to-br from-rose-500/20 via-transparent to-amber-500/10',
        pill: 'border-rose-400/30 bg-rose-500/15 text-rose-200',
        effect: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
      };
    case 'macet':
      return {
        header: 'bg-gradient-to-br from-amber-500/25 via-transparent to-orange-500/15',
        pill: 'border-amber-400/30 bg-amber-500/15 text-amber-200',
        effect: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
      };
    case 'tiktok':
      return {
        header: 'bg-gradient-to-br from-fuchsia-500/25 via-transparent to-sky-500/15',
        pill: 'border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200',
        effect: 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100',
      };
    default:
      return {
        header: 'bg-gradient-to-br from-sky-500/20 via-transparent to-emerald-500/10',
        pill: 'border-sky-400/30 bg-sky-500/15 text-sky-200',
        effect: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
      };
  }
}
