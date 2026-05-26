import { useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import {
  MAX_LOAN_PRINCIPAL,
  MIN_LOAN_PRINCIPAL,
  LOAN_TERM_DAYS,
  LOAN_DAILY_INTEREST_RATE,
  loanInstallment,
  loanDailyInterest,
  loanProgress,
} from '../data/bank';
import { formatIDR, formatIDRCompact, formatPercent } from '../utils/format';

// Step size for the loan slider, in rupiah. Rp 50 juta increments feel right.
const LOAN_STEP = 50_000_000;

export default function Bank({ onTabChange }) {
  const { state, applyLoan, repayLoanFull } = useGame();
  const loan = state.loan;

  return (
    <div className="space-y-6">
      <section className="glass-panel relative overflow-hidden p-5 sm:p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="pill border-amber-400/30 bg-amber-500/10 text-amber-300">
              Bank Mandala Pantura
            </span>
            <h2 className="mt-2 font-display text-2xl font-extrabold text-white">
              💰 Kredit Usaha PO
            </h2>
            <p className="mt-1 max-w-xl text-sm text-white/60">
              Pinjam modal untuk akselerasi armada. Suku bunga{' '}
              <span className="text-amber-300">
                {formatPercent(LOAN_DAILY_INTEREST_RATE * 10)} / 10 hari
              </span>{' '}
              (≈ 0,5% per hari) dari sisa pokok. Tenor maksimal{' '}
              <span className="text-amber-300">{LOAN_TERM_DAYS} hari</span>.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/50">
              Saldo PO
            </div>
            <div
              className={`font-display text-lg font-bold ${
                state.balance < 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {formatIDR(state.balance)}
            </div>
          </div>
        </div>

        {state.daysInDebt > 0 && (
          <div className="relative mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-100">
            ⚠ Sudah {state.daysInDebt} hari saldo minus.{' '}
            <span className="font-bold">
              {5 - state.daysInDebt} hari lagi sebelum pailit!
            </span>
          </div>
        )}
      </section>

      {loan ? (
        <ActiveLoanCard loan={loan} onRepay={repayLoanFull} balance={state.balance} />
      ) : (
        <ApplyLoanCard
          onApply={applyLoan}
          balance={state.balance}
          loanLocked={Boolean(state.gameOver)}
        />
      )}

      <section className="glass-panel p-5">
        <h3 className="font-display text-sm font-bold text-white">
          📜 Aturan Main Bank
        </h3>
        <ul className="mt-2 space-y-1.5 text-xs text-white/65">
          <li>
            🔹 Plafon maksimal{' '}
            <span className="font-bold text-white">{formatIDR(MAX_LOAN_PRINCIPAL)}</span> per
            PO.
          </li>
          <li>
            🔹 Cicilan pokok dipotong otomatis{' '}
            <span className="font-bold text-white">setiap kali tekan "BERANGKAT!"</span>.
          </li>
          <li>
            🔹 Bunga harian {formatPercent(LOAN_DAILY_INTEREST_RATE)} dari sisa pokok ditambah
            ke potongan.
          </li>
          <li>
            🔹 Saldo bisa minus, tapi{' '}
            <span className="font-bold text-rose-300">5 hari berturut-turut</span> minus =
            <span className="font-bold text-rose-300"> Pailit / Game Over</span>.
          </li>
          <li>
            🔹 Pinjaman bisa dilunasi penuh kapan saja tanpa biaya tambahan.
          </li>
        </ul>
        <button onClick={() => onTabChange('dealer')} className="btn-secondary mt-4 text-xs">
          🏪 Belanja armada di Dealer →
        </button>
      </section>
    </div>
  );
}

// ---- Apply form ----------------------------------------------------------

function ApplyLoanCard({ onApply, balance, loanLocked }) {
  const [principal, setPrincipal] = useState(500_000_000);
  const [confirming, setConfirming] = useState(false);

  const installment = useMemo(() => loanInstallment(principal), [principal]);
  const dailyInterestEstimate = useMemo(() => loanDailyInterest(principal), [principal]);
  // Total interest paid if you carry the loan to full term, approximated as
  // an arithmetic progression on the linearly-decreasing principal.
  const totalInterestEstimate = useMemo(() => {
    return Math.round(
      principal * LOAN_DAILY_INTEREST_RATE * (LOAN_TERM_DAYS + 1) / 2
    );
  }, [principal]);

  if (loanLocked) {
    return (
      <div className="glass-panel p-5 text-sm text-white/60">
        Bank tutup — game sudah berakhir. Mulai ulang dari menu utama.
      </div>
    );
  }

  return (
    <section className="glass-panel p-5 sm:p-6">
      <h3 className="font-display text-lg font-bold text-white">Ajukan Kredit Baru</h3>
      <p className="mt-1 text-xs text-white/60">
        Geser slider untuk pilih nominal pinjaman. Cicilan + bunga dipotong otomatis tiap berangkat.
      </p>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-white/50">
            Pokok pinjaman
          </span>
          <span className="font-display text-xl font-extrabold text-amber-300">
            {formatIDR(principal)}
          </span>
        </div>
        <input
          type="range"
          min={MIN_LOAN_PRINCIPAL}
          max={MAX_LOAN_PRINCIPAL}
          step={LOAN_STEP}
          value={principal}
          onChange={(e) => setPrincipal(Number(e.target.value))}
          className="mt-2 w-full accent-amber-400"
        />
        <div className="flex justify-between text-[11px] text-white/45">
          <span>{formatIDRCompact(MIN_LOAN_PRINCIPAL)}</span>
          <span>{formatIDRCompact(MAX_LOAN_PRINCIPAL)}</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Tenor" value={`${LOAN_TERM_DAYS} hari`} tone="text-sky-300" />
        <Stat
          label="Cicilan/berangkat"
          value={formatIDRCompact(installment)}
          tone="text-amber-300"
        />
        <Stat
          label="Bunga hari ke-1"
          value={formatIDRCompact(dailyInterestEstimate)}
          tone="text-rose-300"
        />
        <Stat
          label="Total bunga (estimasi)"
          value={formatIDRCompact(totalInterestEstimate)}
          tone="text-rose-300"
          hint="Jika dibayar penuh tenor"
        />
      </div>

      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm">
        <div className="flex items-center justify-between text-white/70">
          <span>Saldo setelah cair</span>
          <span className="font-display font-bold text-emerald-300">
            {formatIDR(balance + principal)}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-white/50">
          Pinjaman langsung masuk kas hari ini. Cicilan dimulai BERANGKAT! berikutnya.
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        {confirming ? (
          <>
            <button
              onClick={() => setConfirming(false)}
              className="btn-secondary"
            >
              Batal
            </button>
            <button
              onClick={() => {
                onApply(principal);
                setConfirming(false);
              }}
              className="btn-primary"
            >
              Tanda Tangan Akad · {formatIDR(principal)}
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="btn-primary w-full sm:w-auto"
          >
            Ajukan Pinjaman →
          </button>
        )}
      </div>
    </section>
  );
}

// ---- Active loan summary -------------------------------------------------

function ActiveLoanCard({ loan, onRepay, balance }) {
  const progress = loanProgress(loan);
  const interestNext = loanDailyInterest(loan.remaining);
  const installmentNext = Math.min(loan.installment, loan.remaining);
  const totalNext = installmentNext + interestNext;
  const canPayoff = balance >= loan.remaining;
  const [confirmPayoff, setConfirmPayoff] = useState(false);

  return (
    <section className="glass-panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-white">📒 Pinjaman Aktif</h3>
          <span className="pill border-amber-400/30 bg-amber-500/10 text-amber-300">
            Hari ke-{loan.daysActive ?? 0} dari {LOAN_TERM_DAYS}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="text-[10px] uppercase tracking-wider text-white/50">
              Sisa pokok
            </div>
            <div className="mt-1 font-display text-2xl font-extrabold text-rose-300">
              {formatIDR(loan.remaining)}
            </div>
            <div className="mt-2 text-[11px] text-white/50">
              dari pokok awal {formatIDR(loan.principal)}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-white/50">
              {Math.round(progress * 100)}% lunas
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="text-[10px] uppercase tracking-wider text-white/50">
              Potongan BERANGKAT! berikutnya
            </div>
            <div className="mt-1 font-display text-2xl font-extrabold text-amber-300">
              {formatIDR(totalNext)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
                <div className="uppercase tracking-wider text-white/40">Cicilan pokok</div>
                <div className="font-bold text-white">{formatIDR(installmentNext)}</div>
              </div>
              <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
                <div className="uppercase tracking-wider text-white/40">Bunga 0,5%/hr</div>
                <div className="font-bold text-rose-300">{formatIDR(interestNext)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Total dibayar"
            value={formatIDR(loan.totalPaid ?? 0)}
            tone="text-white"
          />
          <Stat
            label="Total bunga"
            value={formatIDR(loan.totalInterestPaid ?? 0)}
            tone="text-rose-300"
          />
          <Stat
            label="Cicilan harian"
            value={formatIDRCompact(loan.installment)}
            tone="text-amber-300"
          />
          <Stat
            label="Pokok awal"
            value={formatIDRCompact(loan.principal)}
            tone="text-sky-300"
          />
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-white/55">
            Lunasi sekarang untuk berhenti dipotong tiap berangkat.
          </div>
          {confirmPayoff ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-white/60">
                Tarik {formatIDR(loan.remaining)} dari saldo?
              </span>
              <button
                onClick={() => setConfirmPayoff(false)}
                className="btn-secondary text-xs"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  onRepay();
                  setConfirmPayoff(false);
                }}
                className="btn-primary text-xs"
              >
                Ya, lunasi
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmPayoff(true)}
              disabled={!canPayoff}
              className="btn-primary"
            >
              {canPayoff
                ? `Lunasi sisa ${formatIDR(loan.remaining)}`
                : `Saldo kurang ${formatIDR(loan.remaining - balance)}`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone = 'text-white', hint }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/45">
        {label}
      </div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-white/40">{hint}</div>}
    </div>
  );
}
