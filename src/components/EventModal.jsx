import { useGame } from '../context/GameContext';

// Renders the pending dispatch-time event (Razia choice / Macet ack / Viral ack).
// The reducer only allows one event to be pending at a time, so we just show
// whatever's in `state.pendingEvent`.

export default function EventModal() {
  const { state, resolveEvent } = useGame();
  const event = state.pendingEvent;
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-lg overflow-hidden">
        <header className={`flex items-center gap-3 border-b border-white/10 p-5 ${toneBg(event.tone)}`}>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-black/40 text-3xl">
            {event.icon}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
              Kejadian di Jalan
            </div>
            <h3 className="font-display text-lg font-extrabold text-white">
              {event.title}
            </h3>
          </div>
        </header>

        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-white/75">{event.body}</p>

          {event.impact && (
            <ul className="space-y-1.5 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/65">
              {event.impact.map((line, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  {line}
                </li>
              ))}
            </ul>
          )}

          {event.requiresChoice ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {event.choices.map((c) => (
                <ChoiceButton
                  key={c.id}
                  label={c.label}
                  helper={c.helper}
                  tone={c.tone}
                  onClick={() => resolveEvent(c.id)}
                />
              ))}
            </div>
          ) : (
            <button onClick={() => resolveEvent('ack')} className="btn-primary w-full">
              Mengerti, Lanjutkan Trip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({ label, helper, tone, onClick }) {
  return (
    <button onClick={onClick} className={`${tone} flex flex-col items-stretch gap-1 !p-4 text-left`}>
      <span className="text-sm font-bold leading-tight">{label}</span>
      {helper && <span className="text-[11px] font-medium opacity-80">{helper}</span>}
    </button>
  );
}

function toneBg(tone) {
  switch (tone) {
    case 'rose':
      return 'bg-gradient-to-br from-rose-500/15 via-transparent to-transparent';
    case 'amber':
      return 'bg-gradient-to-br from-amber-500/15 via-transparent to-transparent';
    case 'emerald':
      return 'bg-gradient-to-br from-emerald-500/15 via-transparent to-transparent';
    default:
      return '';
  }
}
