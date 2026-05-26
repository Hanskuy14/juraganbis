// E-Ticketing & Ads visibility engine. This is the Part 2 marketing AI:
// instead of dice-rolling occupancy from the strategy band, every dispatched
// bus gets a Visibility Score (0..100) that mimics how OTA / search-engine
// algorithms surface listings — players actively bid for impressions, get
// punished for over-pricing, and can be shadowbanned by 1-star reviews.
//
// Pure functions only. State is owned by GameContext.marketing.

import { PRICING_STRATEGIES } from '../data/busTypes';

// --- Tunables -------------------------------------------------------------

// Marketing budget bidding band per route, per day. The slider in the
// Marketing tab is locked to [0 .. MAX_DAILY_AD_SPEND].
export const MAX_DAILY_AD_SPEND = 500_000;     // Rp 500.000
export const AD_SPEND_PRESETS = [0, 100_000, 250_000, 400_000, 500_000];

// PO Reputation (separate from per-trip rating). Floats around 50-100.
// Boots up at a friendly 70 — a fresh PO is "decently rated" out of the
// dealer. New 5-star reviews nudge it up, 1-star reviews drag it down.
export const BASE_RATING_DEFAULT = 70;
export const BASE_RATING_MIN = 20;
export const BASE_RATING_MAX = 100;

// Shadowban window when a 1-star review fires. The base rating loses
// SHADOWBAN_PENALTY visibility points for SHADOWBAN_DAYS days.
export const SHADOWBAN_DAYS = 3;
export const SHADOWBAN_PENALTY = 25;

// Reviews log retention — anything older is pruned to keep saves slim.
export const REVIEWS_KEEP = 30;

// --- Visibility Score -----------------------------------------------------

// Linear contribution from ad spend: 0 Rp -> 0, MAX -> +40 visibility.
// Diminishing-returns is intentionally NOT modeled here — bidding is meant
// to feel like a clean lever the player can dial up.
export function adSpendWeight(budget) {
  if (!budget || budget <= 0) return 0;
  const clamped = Math.min(MAX_DAILY_AD_SPEND, Math.max(0, budget));
  return Math.round((clamped / MAX_DAILY_AD_SPEND) * 40);
}

// Price penalty: how aggressively does this bus over-price relative to the
// market? Cheap (0.8) is rewarded with a small bump, Normal (1.0) is
// neutral, Premium (1.5) hurts. The OTA "hides you on page 2".
export function pricePenalty(strategyId) {
  const strat = PRICING_STRATEGIES[strategyId] ?? PRICING_STRATEGIES.normal;
  const factor = strat.factor;
  if (factor <= 0.85) return -8;     // mild boost — bargain hunters click you
  if (factor <= 1.05) return 0;      // market price, no penalty
  if (factor <= 1.25) return 18;     // moderately above market
  return 32;                          // way above market → shadow-hidden
}

// Whether the PO is currently shadowbanned (a recent 1-star). The reducer
// stores `shadowbanUntilDay` — a day counter, NOT a wall-clock timestamp,
// so the penalty cleanly expires when the player ends days.
export function isShadowbanned(marketing, currentDay) {
  if (!marketing) return false;
  return (marketing.shadowbanUntilDay ?? 0) >= currentDay;
}

export function shadowbanDaysLeft(marketing, currentDay) {
  if (!marketing) return 0;
  return Math.max(0, (marketing.shadowbanUntilDay ?? 0) - currentDay + 1);
}

// Compute the headline score and a transparent breakdown the UI can render
// next to the slider so the player understands WHY their bus is invisible.
export function computeVisibility({
  baseRating = BASE_RATING_DEFAULT,
  budget = 0,
  strategyId = 'normal',
  shadowbanned = false,
  tiktokBoostActive = false,
}) {
  const ad = adSpendWeight(budget);
  const penalty = pricePenalty(strategyId);
  const ban = shadowbanned ? SHADOWBAN_PENALTY : 0;
  // TikTok virality (Part 1 event) gives a juicy bump on top of the formula
  // so the existing event still feels good in the new system.
  const tiktok = tiktokBoostActive ? 12 : 0;

  const raw = baseRating + ad - penalty - ban + tiktok;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score,
    breakdown: {
      baseRating,
      adSpend: ad,
      pricePenalty: penalty,
      shadowban: ban,
      tiktok,
    },
  };
}

// Map a 0..100 visibility score to an occupancy ratio (0..1). Bands chosen
// so the dramatic prompt holds:
//   > 85 → 95-100% capacity (top of page 1)
//   55-85 → 60-90% capacity (mid page 1)
//   40-55 → 30-50% capacity (page 2)
//   < 40 → 10-20% capacity ("ghost bus")
//
// Each band carries a small ±0.03 jitter so two trips at the same score
// don't return identical numbers.
export function visibilityToOccupancy(score, rng = Math.random) {
  const s = Math.max(0, Math.min(100, score));
  const jitter = (rng() - 0.5) * 0.06; // ±3%
  let occ;
  let tier;
  if (s >= 85) {
    occ = 0.95 + rng() * 0.05;
    tier = 'top';
  } else if (s >= 70) {
    occ = 0.80 + ((s - 70) / 15) * 0.15 + jitter;
    tier = 'page1';
  } else if (s >= 55) {
    occ = 0.60 + ((s - 55) / 15) * 0.20 + jitter;
    tier = 'mid';
  } else if (s >= 40) {
    occ = 0.30 + ((s - 40) / 15) * 0.25 + jitter;
    tier = 'page2';
  } else {
    // Ghost bus — burning fuel for almost no passengers.
    occ = 0.10 + (s / 40) * 0.10 + jitter;
    tier = 'ghost';
  }
  return {
    occupancy: Math.max(0.05, Math.min(1.0, occ)),
    tier,
  };
}

// Human-readable label for each occupancy tier (used by Marketing tab and
// the Telemetry modal "expected occupancy" preview).
export const TIER_LABELS = {
  top: { label: 'Top Page 1', tone: 'text-emerald-300', emoji: '🔥' },
  page1: { label: 'Page 1', tone: 'text-emerald-200', emoji: '📈' },
  mid: { label: 'Mid Page', tone: 'text-sky-300', emoji: '📊' },
  page2: { label: 'Page 2', tone: 'text-amber-300', emoji: '⚠️' },
  ghost: { label: 'Ghost Bus', tone: 'text-rose-300', emoji: '👻' },
};

// --- Per-route helpers ----------------------------------------------------

// Read a route's daily budget from marketing state with safe defaults.
export function getRouteBudget(marketing, routeId) {
  if (!marketing || !routeId) return 0;
  return marketing.routeBudgets?.[routeId] ?? 0;
}

// Total marketing spend that should be deducted from balance on dispatch.
// We charge per dispatched bus on the route — players who dispatch 5 buses
// on Jakarta-Surabaya pay 5x the budget. Keeps it simple and proportional.
export function totalMarketingSpend(marketing, frames) {
  if (!marketing || !frames || frames.length === 0) return 0;
  return frames.reduce((acc, f) => acc + getRouteBudget(marketing, f.routeId), 0);
}

// --- Reviews & shadowban --------------------------------------------------

// Generate a 1..5 star review for a finished trip. Drives the shadowban
// trigger AND the long-running base rating drift.
//
// Heuristics:
//   - Crash / breakdown            -> 1 star
//   - Overheat warning ignored     -> 1-2 stars
//   - Storm without intervention   -> 2 stars
//   - Slow-down used (delay)       -> 3 stars (delay annoys)
//   - Emergency pitstop            -> 3-4 stars (delay but safe)
//   - Clean, full bus              -> 5 stars
//   - Otherwise                    -> 4 stars
export function generateReview({
  frame,
  occupancy,
  weatherOutcome,
  busName,
  routeLabel,
  day,
}) {
  if (!frame) return null;

  let stars = 4;
  let comment = 'Perjalanan lumayan, sopir ramah.';

  if (frame.crashed) {
    stars = 1;
    comment = '⚠️ KECELAKAAN! Trauma seumur hidup.';
  } else if (frame.breakdown) {
    stars = 1;
    if (frame.breakdownReason === 'overheat') {
      comment = 'Bus overheat di tengah jalan, telantar berjam-jam!';
    } else if (frame.breakdownReason === 'blowout') {
      comment = 'Ban meledak! Untung selamat — tapi tidak akan naik lagi.';
    } else {
      comment = 'Bus mogok, refund tidak jelas. Mengecewakan.';
    }
  } else if (weatherOutcome?.usedEmergencyPitstop) {
    stars = weatherOutcome.usedSlowDown ? 3 : 4;
    comment = 'Sempat ganti ban di rest area, agak telat tapi aman.';
  } else if (weatherOutcome?.usedSlowDown) {
    stars = 3;
    comment = 'Hujan deras, sopir kurangi kecepatan. Telat sampai tujuan.';
  } else if (weatherOutcome?.weatherSurvivedBald) {
    // Storm hit + tires were nearly bald + player did not intervene but bus
    // somehow made it. Still counts as a scary trip.
    stars = 2;
    comment = 'Hujan badai, ban tipis, sopir nekat. Pegangan kuat seumur hidup.';
  } else if (occupancy >= 0.9 && (frame.finalEngineTemp ?? 80) < 100) {
    stars = 5;
    comment = 'Mantap! Bus penuh, on time, AC dingin. Recommended.';
  } else if (occupancy < 0.2) {
    // Ghost bus — almost nobody on board, no real reviewers either.
    return null;
  }

  return {
    id: `rev-${day}-${frame.busId}-${Math.random().toString(36).slice(2, 7)}`,
    day,
    busId: frame.busId,
    busName,
    routeLabel,
    stars,
    comment,
    timestamp: Date.now(),
  };
}

// Apply a fresh review to the marketing state. Returns a new object.
//   - 5★ → +1.5 base rating
//   - 4★ → +0.5
//   - 3★ → 0
//   - 2★ → -1.5
//   - 1★ → -4 AND triggers shadowban for SHADOWBAN_DAYS days.
export function applyReview(marketing, review, currentDay) {
  if (!marketing || !review) return marketing;
  const m = {
    ...marketing,
    reviews: [review, ...(marketing.reviews ?? [])].slice(0, REVIEWS_KEEP),
  };

  let delta = 0;
  if (review.stars === 5) delta = 1.5;
  else if (review.stars === 4) delta = 0.5;
  else if (review.stars === 3) delta = 0;
  else if (review.stars === 2) delta = -1.5;
  else if (review.stars === 1) delta = -4;

  m.baseRating = Math.max(
    BASE_RATING_MIN,
    Math.min(BASE_RATING_MAX, (marketing.baseRating ?? BASE_RATING_DEFAULT) + delta)
  );

  if (review.stars === 1) {
    // Stack: the new ban window starts from today, but if a longer ban is
    // already active we keep the longer one.
    const newUntil = currentDay + SHADOWBAN_DAYS - 1;
    m.shadowbanUntilDay = Math.max(marketing.shadowbanUntilDay ?? 0, newUntil);
  }

  return m;
}

// --- UI helpers -----------------------------------------------------------

// Star renderer string for compact UIs ("★★★★☆").
export function starsString(n) {
  const s = Math.max(0, Math.min(5, Math.round(n ?? 0)));
  return '★'.repeat(s) + '☆'.repeat(5 - s);
}

// Average stars across the review log (used as the "PO Star Rating" pill).
export function averageStars(reviews) {
  if (!reviews || reviews.length === 0) return 0;
  const sum = reviews.reduce((a, r) => a + (r.stars ?? 0), 0);
  return sum / reviews.length;
}

// --- Initial state --------------------------------------------------------

export function initialMarketingState() {
  return {
    baseRating: BASE_RATING_DEFAULT,
    shadowbanUntilDay: 0,
    routeBudgets: {},
    reviews: [],
  };
}
