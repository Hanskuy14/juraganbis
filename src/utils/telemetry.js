// Real-time telemetry engine. Drives the "Pit Wall" modal: every wall-clock
// tick advances every active bus by one in-game hour, decays tire wear,
// drains fuel, and lets the engine temperature drift.
//
// Pure functions — the modal owns the wall-clock interval, this module
// owns the math.

import { getBusType } from '../data/busTypes';
import { tripResourceCost } from './market';
import {
  initWeatherState,
  tickWeather,
  applySlowDown as applyWeatherSlowDown,
  applyEmergencyPitstop as applyWeatherPitstop,
} from './weather';
import {
  computeVisibility,
  visibilityToOccupancy,
  getRouteBudget,
  isShadowbanned,
} from './marketing';

// --- Tunables -------------------------------------------------------------

// One simulated "trip hour" per real-time tick (the modal uses ~250 ms per
// tick by default — so a 800 km / ~14 h trip resolves in ~3.5 seconds).
export const TICK_KM_PER_HOUR = 60;        // average bus highway speed
export const ENGINE_OPTIMAL_TEMP = 85;     // °C
export const ENGINE_REDLINE_TEMP = 110;    // °C → catastrophic breakdown
export const ENGINE_WARN_TEMP = 100;       // °C → UI warning

// --- Per-bus telemetry frame ---------------------------------------------

// Build the initial telemetry frame for a single dispatched bus. The
// Telemetry modal will tick this through `tickBusTelemetry` until
// `progressKm >= totalKm` OR breakdown=true.
export function initBusTelemetry({
  bus,
  route,
  driver,
  kernet,
  resourceCost,
  marketing,
  currentDay,
  tiktokBoostActive = false,
}) {
  const busType = getBusType(bus.class);
  const totalKm = route.distanceKm;
  const totalHours = Math.max(1, Math.ceil(totalKm / TICK_KM_PER_HOUR));

  // Heat load: a bus in poor condition runs hotter from minute one.
  const conditionFactor = (bus.condition ?? 100) / 100;
  const heatLoad = Math.round(20 * (1 - conditionFactor));   // 0..20 °C extra
  const skillRelief = ((driver?.skill ?? 5) - 5) * 0.4;       // -2..+2 °C calmer

  // E-Ticketing visibility: locked at dispatch time so the live telemetry
  // and the daily report agree on what the player saw before they pressed
  // BERANGKAT. Players who decide to slash budget mid-trip can't game the
  // formula retroactively.
  const budget = getRouteBudget(marketing, route.id);
  const banned = isShadowbanned(marketing, currentDay ?? 1);
  const visibility = computeVisibility({
    baseRating: marketing?.baseRating,
    budget,
    strategyId: route.strategy,
    shadowbanned: banned,
    tiktokBoostActive,
  });
  const occRoll = visibilityToOccupancy(visibility.score);

  const weatherSlice = initWeatherState();

  return {
    busId: bus.id,
    busName: bus.name,
    busClass: busType?.class ?? bus.class,
    capacity: busType?.capacity ?? bus.capacity ?? 0,
    routeId: route.id,
    routeLabel: `${route.fromName} → ${route.toName}`,
    strategy: route.strategy,
    distanceKm: totalKm,
    totalKm,
    totalHours,
    progressKm: 0,
    elapsedHours: 0,

    // Live telemetry vars (the UI watches these every frame).
    tireWear: 100,                                       // %
    engineTemp: ENGINE_OPTIMAL_TEMP - 5,                 // starts cool
    fuelRemaining: resourceCost.fuel,                    // liters
    fuelStarted: resourceCost.fuel,
    tiresRequired: resourceCost.tires,
    partsRequired: resourceCost.parts,

    // Configuration.
    heatLoad,
    skillRelief,
    wearMultiplier: busType?.wearMultiplier ?? 1,
    conditionStart: bus.condition ?? 100,
    driverId: driver?.id ?? null,
    driverName: driver?.name ?? null,
    driverSkill: driver?.skill ?? null,
    kernetId: kernet?.id ?? null,
    kernetName: kernet?.name ?? null,

    // Marketing snapshot.
    marketingBudget: budget,
    visibilityScore: visibility.score,
    visibilityBreakdown: visibility.breakdown,
    visibilityTier: occRoll.tier,
    expectedOccupancy: occRoll.occupancy,

    // Weather + intervention slice (flattened; see utils/weather.js).
    ...weatherSlice,

    // Outcome flags resolved during ticks.
    breakdown: false,
    breakdownReason: null,
    complete: false,
  };
}

// Advance one bus by one in-game hour. Returns a new frame (immutable).
//
// Math:
//   progress  +=  60 km
//   tireWear  -=  base + (wearMult - 1)*1.5    per hour
//   engineTemp drifts toward (OPTIMAL + heatLoad - skillRelief)
//                 with random jitter ± 4 °C
//   fuel      -=  total/totalHours             (linear drain)
//   if temp > REDLINE   -> breakdown (overheat)
//   if tireWear < 5     -> breakdown (blowout) — only if tires were required
export function tickBusTelemetry(prev) {
  if (prev.complete || prev.breakdown || prev.crashed) return prev;

  const next = { ...prev };
  next.elapsedHours = prev.elapsedHours + 1;

  // Storm + slow-down move slightly slower (driver eased off the gas) so
  // the trip noticeably stretches when the player intervenes.
  const speedMult = prev.weather === 'badai' && prev.usedSlowDown ? 0.6 : 1;
  next.progressKm = Math.min(prev.totalKm, prev.progressKm + TICK_KM_PER_HOUR * speedMult);

  // Tire wear: small flat decay + an extra dribble for premium classes.
  // Storms accelerate wear (slipping rubber on wet asphalt), bald-tire
  // pitstop will reset back to 100.
  const stormMult = prev.weather === 'badai' ? 1.6 : 1;
  const wearPerHour =
    (3 + (next.wearMultiplier - 1) * 4) * (next.totalKm / 600) * stormMult;
  next.tireWear = Math.max(0, prev.tireWear - wearPerHour);

  // Fuel: linear drain across total hours so the gauge zeros out at arrival.
  // Apply weather/intervention fuel multiplier (slow-down burns more).
  const fuelPerHour = (next.fuelStarted / next.totalHours) * (prev.extraFuelMult ?? 1);
  next.fuelRemaining = Math.max(0, prev.fuelRemaining - fuelPerHour);

  // Engine temp: drift toward (optimal + heatLoad - skillRelief), plus jitter.
  const target = ENGINE_OPTIMAL_TEMP + next.heatLoad - next.skillRelief;
  const drift = (target - prev.engineTemp) * 0.35;
  const jitter = (Math.random() - 0.45) * 8; // bias slightly hot
  // If condition was already poor (<30%), give a small chance of a heat
  // spike each tick — feels appropriately punishing.
  let spike = 0;
  if (next.conditionStart < 30 && Math.random() < 0.18) {
    spike = 5 + Math.random() * 10;
  } else if (next.conditionStart < 50 && Math.random() < 0.08) {
    spike = 3 + Math.random() * 5;
  }
  next.engineTemp = Math.max(60, prev.engineTemp + drift + jitter + spike);

  // Hard fail: overheat.
  if (next.engineTemp > ENGINE_REDLINE_TEMP) {
    next.breakdown = true;
    next.breakdownReason = 'overheat';
    next.engineTemp = Math.min(135, next.engineTemp);
    next.complete = false;
    return next;
  }

  // Hard fail: tire blowout (only if the route required spares — short hops
  // can scrape by on the existing rubber).
  if (next.tiresRequired > 0 && next.tireWear < 5 && Math.random() < 0.4) {
    next.breakdown = true;
    next.breakdownReason = 'blowout';
    return next;
  }

  // Weather pass — may flip the storm flag, set slip risk, or even crash
  // the bus if the player has been ignoring a storm + bald tires.
  const weatherUpdate = tickWeather(next);
  Object.assign(next, weatherUpdate);

  // Crash flagged this tick → mark as breakdown so the report engine
  // treats it as a failed trip with extra penalty.
  if (next.crashed && !next.breakdown) {
    next.breakdown = true;
    next.breakdownReason = 'crash';
  }

  // Arrival.
  if (next.progressKm >= next.totalKm) {
    next.complete = true;
    next.progressKm = next.totalKm;
    // Snap fuel near zero for clean UI.
    next.fuelRemaining = Math.max(0, next.fuelRemaining);
  }

  return next;
}

// Advance every active frame in the array by one tick. The modal calls this
// on a setInterval and re-renders.
export function tickAllTelemetry(frames) {
  return frames.map(tickBusTelemetry);
}

export function isAllSettled(frames) {
  return frames.every((f) => f.complete || f.breakdown);
}

// --- Plan builder ---------------------------------------------------------

// The dispatch flow first builds a "trip plan" before showing telemetry:
// for every bus, decide if it'll go out today, why it's idle if not, and
// what resources it'll consume. Inventory gating is greedy in fleet order
// — the first busses get the resources, later ones may be told "no fuel".
//
// Returns: { frames: [...], idleRows: [...], totalCost: {fuel, tires, parts} }
export function buildDispatchPlan({
  fleet,
  routesById,
  driversById,
  kernetsById,
  inventory,
  marketing,
  currentDay,
  tiktokBoostActive = false,
}) {
  const frames = [];
  const idleRows = [];
  let remaining = { ...inventory };
  let totalCost = { fuel: 0, tires: 0, parts: 0 };

  for (const bus of fleet) {
    const busType = getBusType(bus.class);
    const route = bus.assignedRoute ? routesById[bus.assignedRoute] : null;
    const driver = bus.assignedDriverId ? driversById[bus.assignedDriverId] : null;
    const kernet = bus.assignedKernetId ? kernetsById[bus.assignedKernetId] : null;

    // Reuse the same idle-reason taxonomy as the legacy engine so the daily
    // report still renders cleanly.
    if (bus.inWorkshop) {
      idleRows.push(makeIdleRow(bus, busType, 'in_workshop', 'Sedang di bengkel'));
      continue;
    }
    if (!route) {
      idleRows.push(makeIdleRow(bus, busType, 'no_route', 'Belum ada trayek'));
      continue;
    }
    if (!driver) {
      idleRows.push(makeIdleRow(bus, busType, 'no_driver', 'Belum ada supir'));
      continue;
    }
    if ((driver.stamina ?? 0) < 20) {
      idleRows.push(
        makeIdleRow(bus, busType, 'driver_tired', `Stamina ${driver.name} habis`)
      );
      continue;
    }

    const cost = tripResourceCost({
      distanceKm: route.distanceKm,
      fuelEfficiency: busType.fuelEfficiency,
    });

    // Greedy inventory check.
    const short = [];
    if ((remaining.fuel ?? 0) < cost.fuel) short.push('Solar');
    if ((remaining.tires ?? 0) < cost.tires) short.push('Ban');
    if ((remaining.parts ?? 0) < cost.parts) short.push('Suku Cadang');
    if (short.length > 0) {
      idleRows.push(
        makeIdleRow(
          bus,
          busType,
          'no_inventory',
          `Stok kurang: ${short.join(', ')}`
        )
      );
      continue;
    }

    // Deduct from the running tally; remember per-bus cost on the frame.
    remaining = {
      fuel: remaining.fuel - cost.fuel,
      tires: remaining.tires - cost.tires,
      parts: remaining.parts - cost.parts,
    };
    totalCost = {
      fuel: totalCost.fuel + cost.fuel,
      tires: totalCost.tires + cost.tires,
      parts: totalCost.parts + cost.parts,
    };

    frames.push(
      initBusTelemetry({
        bus,
        route,
        driver,
        kernet,
        resourceCost: cost,
        marketing,
        currentDay,
        tiktokBoostActive,
      })
    );
  }

  return { frames, idleRows, totalCost };
}

// --- Intervention helpers (used by reducer) ------------------------------

// Apply a "Slow Down" radio command to one frame inside the active session.
// Pure: returns a new frames array. The reducer wraps this in an action.
export function applyFrameSlowDown(frames, busId) {
  return frames.map((f) => (f.busId === busId ? applyWeatherSlowDown(f) : f));
}

// Apply an emergency pitstop to one frame. The reducer is responsible for
// deducting the spare tire from inventory; this only mutates the frame.
export function applyFrameEmergencyPitstop(frames, busId) {
  return frames.map((f) => (f.busId === busId ? applyWeatherPitstop(f) : f));
}

function makeIdleRow(bus, busType, reason, label) {
  return {
    busId: bus.id,
    busName: bus.name,
    busClass: busType?.class ?? bus.class,
    capacity: busType?.capacity ?? bus.capacity ?? 0,
    routeId: null,
    routeLabel: null,
    distanceKm: 0,
    fuelLiters: 0,
    fuelCost: 0,
    ticketPrice: 0,
    occupancy: 0,
    passengers: 0,
    revenue: 0,
    salaries: 0,
    repairFine: 0,
    profit: 0,
    conditionBefore: bus.condition ?? 100,
    conditionAfter: bus.condition ?? 100,
    staminaBefore: 0,
    staminaAfter: 0,
    driverName: null,
    kernetName: null,
    breakdown: false,
    idle: true,
    idleReason: reason,
    idleLabel: label,
  };
}
