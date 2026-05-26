// Bank / Kredit Usaha math. The player can take a single loan up to
// MAX_LOAN_PRINCIPAL. Interest is 5% per 10 days = 0.5% per day on the
// remaining principal. Each "BERANGKAT!" tick deducts one fixed installment
// (principal portion) plus the accrued interest for that day.
//
// Loan term is fixed at LOAN_TERM_DAYS. Effective APR ~= 5% * 36 = 180% over
// the full 60-day term (intentionally punishing — you only take it if you
// know you can grow fast).

export const MAX_LOAN_PRINCIPAL = 2_000_000_000;
export const MIN_LOAN_PRINCIPAL = 100_000_000;
export const LOAN_TERM_DAYS = 60;
export const LOAN_DAILY_INTEREST_RATE = 0.005; // 0.5% per day = 5% per 10 days

// Fixed principal-portion installment per day. Rounded up so the loan
// finishes in <= LOAN_TERM_DAYS ticks.
export function loanInstallment(principal) {
  return Math.ceil(principal / LOAN_TERM_DAYS);
}

// Interest accrued for one day on the remaining principal.
export function loanDailyInterest(remaining) {
  return Math.ceil(Math.max(0, remaining) * LOAN_DAILY_INTEREST_RATE);
}

// Total cash deducted from the player's balance for one BERANGKAT! tick.
export function loanDailyDeduction(loan) {
  if (!loan || loan.remaining <= 0) return { installment: 0, interest: 0, total: 0 };
  const installment = Math.min(loan.installment, loan.remaining);
  const interest = loanDailyInterest(loan.remaining);
  return { installment, interest, total: installment + interest };
}

// Apply one tick of payment to a loan, returning the loan after payment
// (or null if it's fully cleared).
export function tickLoan(loan) {
  if (!loan) return { loan: null, paid: { installment: 0, interest: 0, total: 0 } };
  const paid = loanDailyDeduction(loan);
  const remaining = Math.max(0, loan.remaining - paid.installment);
  const totalPaid = (loan.totalPaid ?? 0) + paid.total;
  const totalInterestPaid = (loan.totalInterestPaid ?? 0) + paid.interest;
  if (remaining <= 0) {
    return { loan: null, paid, lastPayment: { ...paid, clearedAt: Date.now() } };
  }
  return {
    loan: {
      ...loan,
      remaining,
      totalPaid,
      totalInterestPaid,
      daysActive: (loan.daysActive ?? 0) + 1,
    },
    paid,
  };
}

export function loanProgress(loan) {
  if (!loan) return 0;
  return Math.min(1, Math.max(0, 1 - loan.remaining / loan.principal));
}
