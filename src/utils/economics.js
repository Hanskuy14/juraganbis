// Economics engine. Pure functions — no React, no localStorage. This way the
// dispatch loop, the route preview, and (later) tests all share one source of
// truth for revenue / fuel cost / occupancy / condition / stamina math.

import { getBusType, PRICING_STRATEGIES } from '../data/busTypes';
import { getDistance } from '../data/distanceMatrix';
import { STAMINA_REGEN_PER_DAY, STAMINA_TIRED_THRESHOLD } from '../data/personnel';

export const DIESEL_PRICE_PER_LITER = 10_000;
export const BREAKDOWN_FINE = 5_000_000;
export const REPAIR_COST_PER_HP = 200_000; // Rp 200k to repair 1 condition point
export const KERNET_BONUS_PER_KM_PER_PASSENGER = 60; // illegal passenger income
export const CONDITION_NEEDS_SERVICE = 40;
export const CONDITION_BREAKDOWN_RISK = 20;
export const BREAKDOWN_CHANCE = 0.5;
export const KERNET_OVERLOAD_FACTOR = 1.15; // condition damage multiplier

// --- Static (deterministic) preview shown on the dashboard ----------------

export function calculateFuelCost(busTypeId, distanceKm, fuelMult = 1) {
  const bt = getBusType(busTypeId);
  if (!bt || !distanceKm) return { liters: 0, cost: 0 };
  const liters = distanceKm / bt.fuelEfficiency;
  return {
    liters,
    cost: Math.round(liters * DIESEL_PRICE_PER_LITER * fuelMult),
  };
}

export function calculateTicketPrice(busTypeId, distanceKm, strategyId) {
  const bt = getBusType(busTypeId);
  const strat = PRICING_STRATEGIES[strategyId] ?? PRICING_STRATEGIES.normal;
  if (!bt || !distanceKm) return 0;
  return Math.round(bt.pricePerKm * distanceKm * strat.factor);
}

export function expectedOccupancy(strategyId) {
  const strat = PRICING_STRATEGIES[strategyId] ?? PRICING_STRATEGIES.normal;
  const [min, max] = strat.occupancy;
  return (min + max) / 2;
}

// Rolled-up preview for a bus assigned to a route. `demandMult` lets the UI
// preview Viral / Macet boosts without re-implementing the math elsewhere.
export function previewTripEconomics({
  busType,
  distanceKm,
  strategyId,
  demandMult = 1,
  fuelMult = 1,
  hasKernet = false,
}) {
  const fuel = calculateFuelCost(busType.id, distanceKm, fuelMult);
  const ticketPrice = calculateTicketPrice(busType.id, distanceKm, strategyId);
  const baseOcc = expectedOccupancy(strategyId);
  const occ = Math.min(1, baseOcc * demandMult);
  const expectedPassengers = Math.round(busType.capacity * occ);
  const expectedRevenue = ticketPrice * expectedPassengers;
  const kernetBonus = hasKernet
    ? Math.round(KERNET_BONUS_PER_KM_PER_PASSENGER * distanceKm * Math.max(1, expectedPassengers * 0.15))
    : 0;
  const expectedProfit = expectedRevenue + kernetBonus - fuel.cost;
  return {
    distanceKm,
    fuelLiters: fuel.liters,
    fuelCost: fuel.cost,
    ticketPrice,
    expectedOccupancy: occ,
    expectedPassengers,
    expectedRevenue,
    kernetBonus,
    expectedProfit,
  };
}

// --- Dispatch (stochastic) ------------------------------------------------

function rollOccupancy(strategyId, demandMult = 1) {
  const strat = PRICING_STRATEGIES[strategyId] ?? PRICING_STRATEGIES.normal;
  const [min, max] = strat.occupancy;
  const raw = min + Math.random() * (max - min);
  return Math.min(1, raw * demandMult);
}

// Higher skill = less wear. Kernet adds overloading damage.
export function calculateConditionDamage(distanceKm, driverSkill = 5, hasKernet = false) {
  if (!distanceKm) return 0;
  const base = distanceKm / 50; // 1 HP per 50 km
  const skillFactor = 1.2 - (driverSkill / 10) * 0.5; // skill 1->1.15, skill 10->0.7
  const kernetFactor = hasKernet ? KERNET_OVERLOAD_FACTOR : 1;
  return Math.max(1, Math.round(base * skillFactor * kernetFactor));
}

export function calculateStaminaDamage(distanceKm) {
  if (!distanceKm) return 0;
  // 30 base + ~1 per 50km, capped at 60.
  return Math.min(60, 30 + Math.floor(distanceKm / 50));
}

export function calculateRepairCost(currentCondition) {
  const missing = Math.max(0, 100 - currentCondition);
  return Math.round(missing * REPAIR_COST_PER_HP);
}

export function rollBreakdown(condition) {
  if (condition >= CONDITION_BREAKDOWN_RISK) return false;
  return Math.random() < BREAKDOWN_CHANCE;
}

// Resolve the trip outcome for a single bus. Returns a per-bus report row plus
// the side-effect deltas (condition, stamina, salary cost) that the reducer
// uses to update fleet/drivers/kernets.
export function resolveBusTrip(bus, route, opts = {}) {
  const {
    driver = null,
    kernet = null,
    eventMods = { fuelMult: 1, demandMult: 1 },
  } = opts;
  const busType = getBusType(bus.class);

  const baseRow = {
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
    kernetBonus: 0,
    salaryCost: 0,
    profit: 0,
    conditionBefore: bus.condition ?? 100,
    conditionDamage: 0,
    staminaBefore: driver?.stamina ?? null,
    staminaUsed: 0,
    breakdown: false,
    idle: false,
    idleReason: null,
    driverId: driver?.id ?? null,
    driverName: driver?.name ?? null,
    kernetId: kernet?.id ?? null,
    kernetName: kernet?.name ?? null,
    strategy: route?.strategy ?? null,
  };

  // Idle paths -----------------------------------------------------------
  if (bus.status === 'in_service') {
    return { ...baseRow, idle: true, idleReason: 'Sedang di bengkel' };
  }
  if (!busType) {
    return { ...baseRow, idle: true, idleReason: 'Tipe bus tidak dikenal' };
  }
  if (!route) {
    return { ...baseRow, idle: true, idleReason: 'Belum ada trayek' };
  }
  if (!driver) {
    return { ...baseRow, idle: true, idleReason: 'Belum ada supir' };
  }
  if (driver.stamina < STAMINA_TIRED_THRESHOLD) {
    return {
      ...baseRow,
      idle: true,
      idleReason: `Supir kelelahan (${driver.stamina}/100)`,
    };
  }

  // Dispatch path --------------------------------------------------------
  const distanceKm = getDistance(route.fromId, route.toId);
  const fuel = calculateFuelCost(busType.id, distanceKm, eventMods.fuelMult);
  const ticketPrice = calculateTicketPrice(busType.id, distanceKm, route.strategy);
  const occupancy = rollOccupancy(route.strategy, eventMods.demandMult);
  const passengers = Math.round(busType.capacity * occupancy);
  const staminaUsed = calculateStaminaDamage(distanceKm);
  const conditionDamage = calculateConditionDamage(
    distanceKm,
    driver.skill,
    Boolean(kernet)
  );

  // Breakdown check happens BEFORE the trip when condition is dangerously low.
  const breakdown = rollBreakdown(bus.condition ?? 100);

  let revenue = 0;
  let kernetBonus = 0;
  let profit = 0;

  if (breakdown) {
    // Bus mogok: no revenue, eat the fine. Condition still drops a bit.
    revenue = 0;
    kernetBonus = 0;
    profit = -BREAKDOWN_FINE - fuel.cost; // already burned some solar before mogok
  } else {
    revenue = ticketPrice * passengers;
    kernetBonus = kernet
      ? Math.round(
          KERNET_BONUS_PER_KM_PER_PASSENGER *
            distanceKm *
            Math.max(1, passengers * 0.15) *
            (kernet.charisma / 6)
        )
      : 0;
    const salaryCost = (driver.salary ?? 0) + (kernet?.salary ?? 0);
    profit = revenue + kernetBonus - fuel.cost - salaryCost;
  }

  const salaryCost = (driver.salary ?? 0) + (kernet?.salary ?? 0);

  return {
    ...baseRow,
    routeId: route.id,
    routeLabel: `${route.fromName} → ${route.toName}`,
    distanceKm,
    fuelLiters: fuel.liters,
    fuelCost: fuel.cost,
    ticketPrice,
    occupancy,
    passengers: breakdown ? 0 : passengers,
    revenue,
    kernetBonus,
    salaryCost,
    profit,
    conditionDamage: breakdown ? conditionDamage + 10 : conditionDamage,
    staminaUsed,
    breakdown,
    idle: false,
    idleReason: null,
  };
}

// Aggregate totals for the daily report modal.
export function summarizeReport(rows) {
  return rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue + (r.kernetBonus ?? 0);
      acc.fuelCost += r.fuelCost;
      acc.salaryCost += r.salaryCost ?? 0;
      acc.profit += r.profit;
      acc.passengers += r.passengers;
      if (r.breakdown) acc.breakdowns += 1;
      if (!r.idle) acc.dispatched += 1;
      else acc.idle += 1;
      return acc;
    },
    {
      revenue: 0,
      fuelCost: 0,
      salaryCost: 0,
      profit: 0,
      passengers: 0,
      dispatched: 0,
      idle: 0,
      breakdowns: 0,
    }
  );
}

// Aggregated demand multiplier from currently-active boosts (e.g. Viral).
export function aggregateBoostMultipliers(activeBoosts = []) {
  let demandMult = 1;
  for (const b of activeBoosts) {
    if (b.type === 'viral') demandMult *= b.demandMult ?? 1;
  }
  return { demandMult };
}

export { STAMINA_REGEN_PER_DAY, STAMINA_TIRED_THRESHOLD };
