import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { formatIDR } from '../utils/format';
import { loadSave } from '../utils/storage';

export default function MainMenu() {
  const { startNewGame, continueGame, hasExistingSave, STARTING_CAPITAL } =
    useGame();
  const [poName, setPoName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const saved = hasExistingSave ? loadSave() : null;

  const handleStart = (e) => {
    e.preventDefault();
    if (!poName.trim()) return;
    startNewGame(poName);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-900 bg-aurora">
      {/* Decorative road stripe */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-10">
        <div className="mb-8 text-center">
          <span className="pill border-amber-400/30 bg-amber-500/10 text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Tycoon Transportasi · Pulau Jawa
          </span>
          <h1 className="mt-5 font-display text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            Raja <span className="text-amber-400">Pantura</span>
          </h1>
          <p className="mt-2 text-lg font-semibold text-white/80">
            Juragan Bus Malam
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/60">
            Bangun PO bus dari nol. Beli armada, rancang trayek lintas Jawa,
            atur strategi tiket, dan jadilah raja jalan raya Pantura.
          </p>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-2">
          {/* New Game card */}
          <div className="glass-panel p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                Game Baru
              </h2>
              <span className="pill border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                Modal {formatIDR(STARTING_CAPITAL)}
              </span>
            </div>

            {!showNew ? (
              <>
                <p className="mb-5 text-sm text-white/60">
                  Mulai karier baru sebagai juragan PO. Kasih nama perusahaan
                  bus-mu, lalu berangkat ke dealer karoseri.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNew(true)}
                  className="btn-primary w-full"
                >
                  Mulai Petualangan
                </button>
              </>
            ) : (
              <form onSubmit={handleStart}>
                <label className="field-label" htmlFor="po-name">
                  Nama PO
                </label>
                <input
                  id="po-name"
                  autoFocus
                  type="text"
                  maxLength={36}
                  value={poName}
                  onChange={(e) => setPoName(e.target.value)}
                  placeholder="Contoh: PO Sumber Rejeki"
                  className="field-input"
                />
                <p className="mt-2 text-xs text-white/40">
                  Tip: pakai nama berwibawa biar penumpang percaya.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNew(false);
                      setPoName('');
                    }}
                    className="btn-secondary flex-1"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!poName.trim()}
                    className="btn-primary flex-1"
                  >
                    Berangkat!
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Continue Game card */}
          <div
            className={`glass-panel p-6 ${
              hasExistingSave ? '' : 'opacity-60'
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                Lanjutkan
              </h2>
              {hasExistingSave ? (
                <span className="pill border-sky-400/30 bg-sky-500/10 text-sky-300">
                  Hari ke-{saved?.day ?? 1}
                </span>
              ) : (
                <span className="pill border-white/10 bg-white/5 text-white/40">
                  Belum ada save
                </span>
              )}
            </div>

            {hasExistingSave && saved ? (
              <div className="mb-5 space-y-2 text-sm">
                <div className="flex items-center justify-between text-white/70">
                  <span>PO</span>
                  <span className="font-semibold text-white">
                    {saved.poName}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/70">
                  <span>Saldo</span>
                  <span className="font-semibold text-emerald-300">
                    {formatIDR(saved.balance)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/70">
                  <span>Armada</span>
                  <span className="font-semibold text-white">
                    {saved.fleet?.length ?? 0} bus
                  </span>
                </div>
              </div>
            ) : (
              <p className="mb-5 text-sm text-white/60">
                Save game tersimpan di browser ini akan muncul di sini setelah
                kamu memulai sebuah game.
              </p>
            )}
            <button
              type="button"
              onClick={continueGame}
              disabled={!hasExistingSave}
              className="btn-secondary w-full"
            >
              Lanjut Main
            </button>
          </div>
        </div>

        {/* Lore strip */}
        <div className="mt-10 grid w-full gap-3 text-xs text-white/60 sm:grid-cols-3">
          <FeatureChip
            icon="🚌"
            title="Armada Beragam"
            text="Dari Bumel ekonomis sampai Sleeper Premium."
          />
          <FeatureChip
            icon="🗺️"
            title="Trayek Bebas"
            text="11 kota Jawa, kombinasi rute sesukamu."
          />
          <FeatureChip
            icon="💰"
            title="Strategi Tiket"
            text="Murah, Normal, atau Mahal — risikonya kamu yang atur."
          />
        </div>
      </div>
    </div>
  );
}

function FeatureChip({ icon, title, text }) {
  return (
    <div className="glass-card flex items-start gap-3 p-3">
      <div className="text-xl">{icon}</div>
      <div>
        <div className="font-semibold text-white">{title}</div>
        <div className="text-white/50">{text}</div>
      </div>
    </div>
  );
}
