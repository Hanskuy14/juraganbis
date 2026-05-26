// Dynamic weather AI for live telemetry. Drives the "Race Control" mid-trip
// drama — every active frame may roll into a thunderstorm, the player has
// to actively radio the driver to slow down, and bald tires + storm + AFK
// = crash.
//
// Pure functions. Frame state is the source of truth; the modal renders it,
// the reducer mutates it.

// --- Tunables -------------------------------------------------------------

// At every tick, if weather has not yet been triggered AND the trip
// progress is past the trigger threshold, roll once for stormy weather.
// 50% — frequent enough to be a real mechanic, rare enough that calm
// trips still happen.
export const WEATHER_TRIGGER_PROGRESS_MIN = 0.30;
export const WEATHER_TRIGGER_PROGRESS_MAX = 0.65;
export const STORM_BASE_CHANCE = 0.5;

// Once a storm is active, the player has this many ticks to react before
// the bus crashes. With TICK_MS=250 this is ~1.5 s of wall clock — short
// enough to feel like a real intervention.
export const AFK_GRACE_TICKS = 6;

// Slow-down side effects.
export const SLOWDOWN_FUEL_MULT = 1.30;        // burns 30% more fuel
export const SLOWDOWN_TIME_PENALTY_HOURS = 2;  // adds 2 trip hours
export const SLOWDOWN_SATISFACTION_HIT = 0.15; // -15% revenue (delay refund)

// Emergency pitstop side effects.
export const PITSTOP_TIME_PENALTY_HOURS = 3;   // 3 hour delay
export const PITSTOP_SATISFACTION_HIT = 0.20;  // -20% revenue
export const PITSTOP_TIRE_RESET = 100;         // resets tire wear gauge

// --- Frame additions ------------------------------------------------------

// Returns a fresh weather sub-state to merge into a telemetry frame at
// initBusTelemetry time. Each bus rolls its OWN trigger threshold so the
// fleet doesn't all hit the storm at the same tick.
export function initWeatherState() {
  const trigger =
    WEATHER_TRIGGER_PROGRESS_MIN +
    Math.random() * (WEATHER_TRIGGER_PROGRESS_MAX - WEATHER_TRIGGER_PROGRESS_MIN);
  return {
    weather: 'cerah',                  // 'cerah' | 'mendung' | 'badai'
    weatherTriggered: false,
    weatherTriggerProgress: trigger,
    slipRisk: 0,                       // 0..1 — chance of crash this tick if AFK
    awaitingAction: false,             // any radio action available
    actionsTaken: [],                  // history: 'slowdown' | 'pitstop'
    usedSlowDown: false,
    usedEmergencyPitstop: false,
    afkTicks: 0,                       // ticks since storm hit, no action
    crashed: false,
    crashReason: null,
    extraFuelMult: 1,
    extraTimePenaltyHours: 0,
    satisfactionPenalty: 0,            // 0..1 cumulative revenue cut
    weatherSurvivedBald: false,        // for review heuristics
  };
}

// One tick of weather logic — called from tickBusTelemetry. Returns an
// updated weather slice (does NOT mutate). The caller merges the slice
// back onto the frame.
//
// `frame` is the entire post-physics frame for this tick (so we can read
// the latest tireWear / progressKm / breakdown flags).
export function tickWeather(frame) {
  const prev = pickWeather(frame);

  // If the trip is already done or wrecked, stop weather sim.
  if (frame.complete || frame.breakdown || prev.crashed) {
    return prev;
  }

  let next = { ...prev };
  const progress = frame.totalKm > 0 ? frame.progressKm / frame.totalKm : 0;

  // Roll for storm once we cross the threshold.
  if (!next.weatherTriggered && progress >= next.weatherTriggerProgress) {
    next.weatherTriggered = true;
    if (Math.random() < STORM_BASE_CHANCE) {
      next.weather = 'badai';
      next.awaitingAction = true;
    } else {
      // Light rain — atmospheric but no real penalty. Not actionable.
      next.weather = 'mendung';
    }
  }

  // Active storm: compute slip risk based on tire wear.
  if (next.weather === 'badai' && !next.usedSlowDown) {
    // Bald tires + storm = lethal. Fresh tires can shrug it off.
    const tireFactor = 1 - frame.tireWear / 100; // 0 fresh, 1 bald
    next.slipRisk = Math.min(0.95, 0.20 + tireFactor * 0.75);
  } else {
    next.slipRisk = 0;
  }

  // AFK accumulator — only ticks while a storm is active and slip risk is
  // non-trivial. The Telemetry modal must render the radio buttons for the
  // player to clear `awaitingAction`.
  if (next.weather === 'badai' && next.slipRisk > 0.3 && !next.usedSlowDown) {
    next.afkTicks = next.afkTicks + 1;
    if (next.afkTicks >= AFK_GRACE_TICKS) {
      // Roll for crash. Probability scales with slip risk so a rookie that
      // ignores a 0.9 risk almost always crashes; a 0.3 risk merely
      // sweats.
      if (Math.random() < next.slipRisk) {
        next.crashed = true;
        next.crashReason = 'storm_no_intervention';
      } else {
        // Survived a single sketchy tick — reset the AFK counter so the
        // game gives them another chance to react.
        next.afkTicks = Math.floor(AFK_GRACE_TICKS / 2);
        next.weatherSurvivedBald = true;
      }
    }
  } else {
    next.afkTicks = 0;
  }

  return next;
}

// --- Player actions -------------------------------------------------------

// Apply a "Slow Down" intervention onto a frame. Returns a new frame with
// the weather slice updated AND the trip-level fuel/time effects applied.
export function applySlowDown(frame) {
  const w = pickWeather(frame);
  if (frame.complete || frame.breakdown || w.crashed) return frame;
  if (w.usedSlowDown) return frame;

  const next = { ...frame };
  const nextW = {
    ...w,
    usedSlowDown: true,
    awaitingAction: false,
    afkTicks: 0,
    slipRisk: 0,
    actionsTaken: [...w.actionsTaken, 'slowdown'],
    extraFuelMult: w.extraFuelMult * SLOWDOWN_FUEL_MULT,
    extraTimePenaltyHours: w.extraTimePenaltyHours + SLOWDOWN_TIME_PENALTY_HOURS,
    satisfactionPenalty: Math.min(0.7, w.satisfactionPenalty + SLOWDOWN_SATISFACTION_HIT),
  };
  // Stretch totalHours so the gauge reflects the delay visually. We do NOT
  // change totalKm — the bus still has to cover the same distance.
  next.totalHours = next.totalHours + SLOWDOWN_TIME_PENALTY_HOURS;
  // Burn extra fuel from the running gauge (player feels the cost
  // immediately, not just on the report).
  const extraBurn = next.fuelStarted * 0.05;
  next.fuelRemaining = Math.max(0, next.fuelRemaining - extraBurn);
  return Object.assign(next, nextW);
}

// Apply an "Emergency Pitstop" — consumes one spare tire from inventory at
// the reducer level (the action returns a flag the reducer reads).
export function applyEmergencyPitstop(frame) {
  const w = pickWeather(frame);
  if (frame.complete || frame.breakdown || w.crashed) return frame;
  if (w.usedEmergencyPitstop) return frame;

  const next = { ...frame };
  const nextW = {
    ...w,
    usedEmergencyPitstop: true,
    awaitingAction: false,
    afkTicks: 0,
    slipRisk: 0,
    actionsTaken: [...w.actionsTaken, 'pitstop'],
    extraTimePenaltyHours: w.extraTimePenaltyHours + PITSTOP_TIME_PENALTY_HOURS,
    satisfactionPenalty: Math.min(0.7, w.satisfactionPenalty + PITSTOP_SATISFACTION_HIT),
  };
  next.tireWear = PITSTOP_TIRE_RESET;
  next.totalHours = next.totalHours + PITSTOP_TIME_PENALTY_HOURS;
  return Object.assign(next, nextW);
}

// --- Helpers --------------------------------------------------------------

// Frames built by initBusTelemetry have the weather fields flattened onto
// them — we don't keep a nested `weather:` sub-object so React's shallow
// re-render works without ceremony. This helper returns the slice as if it
// were nested for code clarity.
function pickWeather(frame) {
  return {
    weather: frame.weather ?? 'cerah',
    weatherTriggered: frame.weatherTriggered ?? false,
    weatherTriggerProgress: frame.weatherTriggerProgress ?? 0.5,
    slipRisk: frame.slipRisk ?? 0,
    awaitingAction: frame.awaitingAction ?? false,
    actionsTaken: frame.actionsTaken ?? [],
    usedSlowDown: frame.usedSlowDown ?? false,
    usedEmergencyPitstop: frame.usedEmergencyPitstop ?? false,
    afkTicks: frame.afkTicks ?? 0,
    crashed: frame.crashed ?? false,
    crashReason: frame.crashReason ?? null,
    extraFuelMult: frame.extraFuelMult ?? 1,
    extraTimePenaltyHours: frame.extraTimePenaltyHours ?? 0,
    satisfactionPenalty: frame.satisfactionPenalty ?? 0,
    weatherSurvivedBald: frame.weatherSurvivedBald ?? false,
  };
}

// Snapshot the weather slice from a frame for downstream consumers
// (resolveTelemetryTrip, generateReview).
export function readWeather(frame) {
  return pickWeather(frame);
}

// UI labels.
export const WEATHER_LABELS = {
  cerah: { label: 'Cerah', emoji: '☀️', tone: 'text-amber-300' },
  mendung: { label: 'Hujan Ringan', emoji: '🌦️', tone: 'text-sky-300' },
  badai: { label: 'Hujan Badai', emoji: '⛈️', tone: 'text-rose-300' },
};
