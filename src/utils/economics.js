// Economics engine. Pure functions — no React, no localStorage. This way the
// dispatch loop, the route preview, and (later) tests all share one source of
// truth for revenue / fuel cost / occupancy / wear / event math.

import {
  getBusType,
  PRICING_STRATEGIES,
  CONDITION_BREAKDOWN_RISK,
  BREAKDOWN_FINE,
} from '../data/busTypes';
import { getDistance } from '../data/distanceMatrix';
import {
  KERNET_PENUMPANG_GELAP_BONUS,
  KERNET_OVERLOAD_WEAR,
  staminaDrainForTrip,
  skillConditionMultiplier,
  driverTripSalary,
} from '../data/staff';

export const DIESEL_PRICE_PER_LITER = 10_000;

// --- Static (deterministic) preview shown on the dashboard ----------------

// Liters and rupiah of fuel for one trip on a given route + bus.
export function calculateFuelCost(busTypeId, distanceKm) {
  const bt = getBusType(busTypeId);
  if (!bt || !distanceKm) return { liters: 0, cost: 0 };
  const liters = distanceKm / bt.fuelEfficiency;
  return {
    liters,
    cost: Math.round(liters * DIESEL_PRICE_PER_LITER),
  };
}

// Per-seat ticket price after applying the strategy margin factor.
export function calculateTicketPrice(busTypeId, distanceKm, strategyId) {
  const bt = getBusType(busTypeId);
  const strat = PRICING_STRATEGIES[strategyId] ?? PRICING_STRATEGIES.normal;
  if (!bt || !distanceKm) return 0;
  return Math.round(bt.pricePerKm * distanceKm * strat.factor);
}

// Mid-band occupancy used for "expected" preview cards (not the actual
// dispatch). Dispatch uses the random version below.
export function expectedOccupancy(strategyId) {
  const strat = PRICING_STRATEGIES[strategyId] ?? PRICING_STRATEGIES.normal;
  const [min, max] = strat.occupancy;
  return (min + max) / 2;
}

// Rolled-up preview the dashboard shows for a bus assigned to a route.
export function previewTripEconomics({ busType, distanceKm, strategyId }) {
  const fuel = calculateFuelCost(busType.id, distanceKm);
  const ticketPrice = calculateTicketPrice(busType.id, distanceKm, strategyId);
  const occ = expectedOccupancy(strategyId);
  const expectedPassengers = Math.round(busType.capacity * occ);
  const expectedRevenue = ticketPrice * expectedPassengers;
  const expectedProfit = expectedRevenue - fuel.cost;
  return {
    distanceKm,
    fuelLiters: fuel.liters,
    fuelCost: fuel.cost,
    ticketPrice,
    expectedOccupancy: occ,
    expectedPassengers,
    expectedRevenue,
    expectedProfit,
  };
}

// --- Wear / condition -----------------------------------------------------

// Condition damage per trip:
//   - base: 5 points + 1 per 100 km of distance
//   - * busType.wearMultiplier (sleeper > patas > bumel)
//   - * skillConditionMultiplier (good drivers wear less)
//   - * KERNET_OVERLOAD_WEAR if a kernet is on board
export function calculateConditionDamage({
  distanceKm,
  busType,
  driverSkill = 5,
  hasKernet = false,
}) {
  const base = 5 + distanceKm / 100;
  const skillMult = skillConditionMultiplier(driverSkill);
  const classMult = busType?.wearMultiplier ?? 1;
  const kernetMult = hasKernet ? KERNET_OVERLOAD_WEAR : 1;
  return Math.max(1, Math.round(base * classMult * skillMult * kernetMult));
}

// --- Dispatch (stochastic) ------------------------------------------------

function rollOccupancy(strategyId) {
  const strat = PRICING_STRATEGIES[strategyId] ?? PRICING_STRATEGIES.normal;
  const [min, max] = strat.occupancy;
  return min + Math.random() * (max - min);
}

// Build an idle row (bus does not run today). `reason` is a short tag the
// report modal can display.
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

// Resolve a single bus's trip for the day. Returns a per-bus report row.
// `route` may be null — the bus simply rests in the garage that day.
//
// `ctx` packs the optional run-time context: assigned driver, kernet,
// the active road event (if any) and the current TikTok demand boost.
export function resolveBusTrip(bus, route, ctx = {}) {
  const busType = getBusType(bus.class);
  const {
    driver = null,
    kernet = null,
    event = null,
    tiktokBoostActive = false,
  } = ctx;

  if (!busType) return makeIdleRow(bus, busType, 'unknown', 'Tipe bus tidak dikenali');

  // 1. Hard idle reasons -- order matters for messaging.
  if (bus.inWorkshop) {
    return makeIdleRow(bus, busType, 'in_workshop', 'Sedang di bengkel');
  }
  if (!route) {
    return makeIdleRow(bus, busType, 'no_route', 'Belum ada trayek');
  }
  if (!driver) {
    return makeIdleRow(bus, busType, 'no_driver', 'Belum ada supir');
  }
  if ((driver.stamina ?? 0) < 20) {
    return makeIdleRow(bus, busType, 'driver_tired', `Stamina ${driver.name} habis`);
  }

  // 2. Active route economics (before event modifiers).
  const distanceKm = getDistance(route.fromId, route.toId);
  const fuel = calculateFuelCost(busType.id, distanceKm);
  const ticketPrice = calculateTicketPrice(busType.id, distanceKm, route.strategy);

  // Occupancy roll, optionally boosted by TikTok virality.
  let occupancy = rollOccupancy(route.strategy);
  if (tiktokBoostActive) {
    occupancy = Math.min(1, occupancy * 1.3);
  }

  // 3. Event modifiers.
  let revenueMultiplier = 1;
  let fuelMultiplier = 1;
  let extraExpense = 0;
  const eventNotes = [];

  if (event) {
    if (event.id === 'razia') {
      if (event.choice === 'bribe') {
        extraExpense += 500_000;
        eventNotes.push('Razia: bayar uang kopi Rp 500.000');
      } else if (event.choice === 'refuse') {
        extraExpense += 2_000_000;
        revenueMultiplier *= 0.7; // delayed → some passengers refund
        eventNotes.push('Razia: kena denda Rp 2.000.000 + telat');
      }
    } else if (event.id === 'macet') {
      fuelMultiplier *= 1.5;
      revenueMultiplier *= 0.85; // satisfaction drop
      eventNotes.push('Macet Tol Cikampek: BBM +50%, kepuasan turun');
    } else if (event.id === 'tiktok') {
      // Already baked into occupancy boost; flag for the report.
      eventNotes.push('Viral di TikTok: demand naik 30%');
    }
  }

  const passengers = Math.round(busType.capacity * occupancy);
  const baseRevenue = ticketPrice * passengers;
  let revenue = Math.round(baseRevenue * revenueMultiplier);

  // Kernet's "penumpang gelap" passive bonus.
  if (kernet) {
    revenue += KERNET_PENUMPANG_GELAP_BONUS;
  }

  const fuelCost = Math.round(fuel.cost * fuelMultiplier);

  // 4. Salaries (per trip).
  const driverSalary = driverTripSalary(driver.skill ?? 5);
  const kernetSalary = kernet ? kernet.salary ?? 75_000 : 0;
  const salaries = driverSalary + kernetSalary;

  // 5. Wear & breakdown roll.
  const conditionBefore = bus.condition ?? 100;
  let damage = calculateConditionDamage({
    distanceKm,
    busType,
    driverSkill: driver.skill ?? 5,
    hasKernet: Boolean(kernet),
  });

  // Mogok? Only possible if dispatched while already very low.
  let breakdown = false;
  let repairFine = 0;
  if (conditionBefore < CONDITION_BREAKDOWN_RISK && Math.random() < 0.5) {
    breakdown = true;
    repairFine = BREAKDOWN_FINE;
    revenue = 0;             // 0 income on this trip
    damage = Math.max(damage, 30); // big cosmetic hit on top
    eventNotes.push('🛠 MOGOK di tengah jalan! Pendapatan 0, kena denda perbaikan.');
  }

  const conditionAfter = Math.max(0, conditionBefore - damage);

  // 6. Stamina drain.
  const staminaBefore = driver.stamina ?? 100;
  const drain = staminaDrainForTrip(distanceKm, driver.skill ?? 5);
  const staminaAfter = Math.max(0, staminaBefore - drain);

  const profit = revenue - fuelCost - salaries - extraExpense - repairFine;

  return {
    busId: bus.id,
    busName: bus.name,
    busClass: busType.class,
    capacity: busType.capacity,
    routeId: route.id,
    routeLabel: `${route.fromName} → ${route.toName}`,
    strategy: route.strategy,
    distanceKm,
    fuelLiters: fuel.liters,
    fuelCost,
    ticketPrice,
    occupancy,
    passengers,
    revenue,
    salaries,
    extraExpense,
    repairFine,
    profit,
    conditionBefore,
    conditionAfter,
    conditionDamage: damage,
    staminaBefore,
    staminaAfter,
    driverId: driver.id,
    driverName: driver.name,
    driverSkill: driver.skill,
    kernetId: kernet?.id ?? null,
    kernetName: kernet?.name ?? null,
    breakdown,
    eventNotes,
    idle: false,
  };
}

// --- Telemetry-driven dispatch -------------------------------------------

// Resolve a single bus's trip given a finished telemetry frame.
// This mirrors `resolveBusTrip` but the breakdown decision comes from the
// real-time engine (overheat or blowout) instead of a dice roll.
//
// `frame` is the final shape from utils/telemetry.js.
export function resolveTelemetryTrip(bus, route, frame, ctx = {}) {
  const busType = getBusType(bus.class);
  const {
    driver = null,
    kernet = null,
    event = null,
    tiktokBoostActive = false,
  } = ctx;

  if (!busType || !route || !driver) {
    return null;
  }

  const distanceKm = route.distanceKm;
  const fuelLiters = frame.fuelStarted;
  const ticketPrice = calculateTicketPrice(busType.id, distanceKm, route.strategy);

  let occupancy = rollOccupancy(route.strategy);
  if (tiktokBoostActive) occupancy = Math.min(1, occupancy * 1.3);

  let revenueMultiplier = 1;
  let fuelMultiplier = 1;        // kept for symmetry with resolveBusTrip
  let extraExpense = 0;
  const eventNotes = [];

  if (event) {
    if (event.id === 'razia') {
      if (event.choice === 'bribe') {
        extraExpense += 500_000;
        eventNotes.push('Razia: bayar uang kopi Rp 500.000');
      } else if (event.choice === 'refuse') {
        extraExpense += 2_000_000;
        revenueMultiplier *= 0.7;
        eventNotes.push('Razia: kena denda Rp 2.000.000 + telat');
      }
    } else if (event.id === 'macet') {
      fuelMultiplier *= 1.5;
      revenueMultiplier *= 0.85;
      eventNotes.push('Macet Tol Cikampek: BBM +50%, kepuasan turun');
    } else if (event.id === 'tiktok') {
      eventNotes.push('Viral di TikTok: demand naik 30%');
    }
  }

  const passengers = Math.round(busType.capacity * occupancy);
  const baseRevenue = ticketPrice * passengers;
  let revenue = Math.round(baseRevenue * revenueMultiplier);

  if (kernet) revenue += KERNET_PENUMPANG_GELAP_BONUS;

  // Fuel expense is now zero in cash terms (already paid via inventory),
  // but we keep the report fields populated for the daily report UI.
  const fuelLitersFinal = Math.round(fuelLiters * fuelMultiplier);
  const fuelCost = 0; // legacy field retained for compatibility

  const driverSalary = driverTripSalary(driver.skill ?? 5);
  const kernetSalary = kernet ? kernet.salary ?? 75_000 : 0;
  const salaries = driverSalary + kernetSalary;

  const conditionBefore = frame.conditionStart;
  let damage = calculateConditionDamage({
    distanceKm,
    busType,
    driverSkill: driver.skill ?? 5,
    hasKernet: Boolean(kernet),
  });

  let breakdown = false;
  let repairFine = 0;
  if (frame.breakdown) {
    breakdown = true;
    repairFine = BREAKDOWN_FINE;
    revenue = 0;
    damage = Math.max(damage, frame.breakdownReason === 'overheat' ? 45 : 30);
    if (frame.breakdownReason === 'overheat') {
      eventNotes.push('🔥 Mesin overheat di tengah jalan! Pendapatan 0, denda perbaikan.');
    } else if (frame.breakdownReason === 'blowout') {
      eventNotes.push('💥 Ban meledak! Trip gagal, denda perbaikan.');
    } else {
      eventNotes.push('🛠 MOGOK di tengah jalan! Pendapatan 0, denda perbaikan.');
    }
  }

  const conditionAfter = Math.max(0, conditionBefore - damage);

  const staminaBefore = driver.stamina ?? 100;
  const drain = staminaDrainForTrip(distanceKm, driver.skill ?? 5);
  const staminaAfter = Math.max(0, staminaBefore - drain);

  const profit = revenue - fuelCost - salaries - extraExpense - repairFine;

  return {
    busId: bus.id,
    busName: bus.name,
    busClass: busType.class,
    capacity: busType.capacity,
    routeId: route.id,
    routeLabel: `${route.fromName} → ${route.toName}`,
    strategy: route.strategy,
    distanceKm,
    fuelLiters: fuelLitersFinal,
    fuelCost,
    ticketPrice,
    occupancy,
    passengers,
    revenue,
    salaries,
    extraExpense,
    repairFine,
    profit,
    conditionBefore,
    conditionAfter,
    conditionDamage: damage,
    staminaBefore,
    staminaAfter,
    driverId: driver.id,
    driverName: driver.name,
    driverSkill: driver.skill,
    kernetId: kernet?.id ?? null,
    kernetName: kernet?.name ?? null,
    breakdown,
    breakdownReason: frame.breakdownReason ?? null,
    finalEngineTemp: Math.round(frame.engineTemp),
    finalTireWear: Math.round(frame.tireWear),
    eventNotes,
    idle: false,
  };
}

// Aggregate totals for the daily report modal.
export function summarizeReport(rows) {
  return rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue;
      acc.fuelCost += r.fuelCost;
      acc.salaries += r.salaries ?? 0;
      acc.extraExpense += r.extraExpense ?? 0;
      acc.repairFine += r.repairFine ?? 0;
      acc.profit += r.profit;
      acc.passengers += r.passengers;
      if (!r.idle) acc.dispatched += 1;
      else acc.idle += 1;
      if (r.breakdown) acc.breakdowns += 1;
      return acc;
    },
    {
      revenue: 0, fuelCost: 0, salaries: 0, extraExpense: 0, repairFine: 0,
      profit: 0, passengers: 0, dispatched: 0, idle: 0, breakdowns: 0,
    }
  );
}

// --- Road event roll ------------------------------------------------------

// Given the current dispatch context, decides if a road event should pop up.
// Returns null OR an event descriptor: { id, requiresChoice, payload }
//
// Notes:
//   - 35% trigger chance overall.
//   - Only rolled if at least one bus is actually going to dispatch.
//   - "tiktok" only fires when there's an eligible flagship trip
//     (a sleeper bus OR a high-skill driver, skill >= 8).
export function rollRoadEvent(dispatchableTrips) {
  if (!dispatchableTrips || dispatchableTrips.length === 0) return null;
  if (Math.random() >= 0.35) return null;

  const hasFlagship = dispatchableTrips.some(
    (t) => t.busClass === 'sleeper' || (t.driverSkill ?? 0) >= 8
  );

  // Pool of events available right now.
  const pool = ['razia', 'macet'];
  if (hasFlagship) pool.push('tiktok');

  const picked = pool[Math.floor(Math.random() * pool.length)];

  if (picked === 'razia') {
    return {
      id: 'razia',
      requiresChoice: true,
      title: 'Razia Jembatan Timbang',
      icon: '🛂',
      description:
        'Petugas DLLAJ menahan armada di jembatan timbang Tegal. Ada dua pilihan...',
      choices: [
        {
          id: 'bribe',
          label: 'Bayar Uang Kopi (Rp 500.000)',
          tone: 'btn-secondary',
          summary: 'Aman lanjut. Dompet kena ringan.',
        },
        {
          id: 'refuse',
          label: 'Tolak — Lawan Hukum (Denda Rp 2.000.000)',
          tone: 'btn-danger',
          summary: 'Telat berangkat, sebagian penumpang refund.',
        },
      ],
    };
  }
  if (picked === 'macet') {
    return {
      id: 'macet',
      requiresChoice: false,
      title: 'Macet Parah Tol Cikampek',
      icon: '🚧',
      description:
        'Lalu lintas berhenti total 4 jam di KM 47. BBM jadi boros, penumpang ngomel.',
      effect: 'BBM trip ini +50%. Pendapatan turun 15% akibat refund kepuasan.',
    };
  }
  // tiktok
  return {
    id: 'tiktok',
    requiresChoice: false,
    title: 'Viral di TikTok!',
    icon: '🎬',
    description:
      'Reviewer "BusMania ID" upload video sleeper armada-mu, langsung trending. Tiket diserbu.',
    effect: 'Demand penumpang +30% selama 3 hari ke depan.',
  };
}
