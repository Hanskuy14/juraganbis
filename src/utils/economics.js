// Economics engine. Pure functions — no React, no localStorage. This way the
// dispatch loop, the route preview, and (later) tests all share one source of
// truth for revenue / fuel cost / occupancy math.

import { getBusType, PRICING_STRATEGIES } from '../data/busTypes';
import { getDistance } from '../data/distanceMatrix';

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

// --- Dispatch (stochastic) ------------------------------------------------

function rollOccupancy(strategyId) {
  const strat = PRICING_STRATEGIES[strategyId] ?? PRICING_STRATEGIES.normal;
  const [min, max] = strat.occupancy;
  return min + Math.random() * (max - min);
}

// Resolve a single bus's trip for the day. Returns a per-bus report row.
// `route` may be null — the bus simply rests in the garage that day.
export function resolveBusTrip(bus, route) {
  const busType = getBusType(bus.class);

  if (!route || !busType) {
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
      profit: 0,
      idle: true,
    };
  }

  const distanceKm = getDistance(route.fromId, route.toId);
  const fuel = calculateFuelCost(busType.id, distanceKm);
  const ticketPrice = calculateTicketPrice(
    busType.id,
    distanceKm,
    route.strategy
  );
  const occupancy = rollOccupancy(route.strategy);
  const passengers = Math.round(busType.capacity * occupancy);
  const revenue = ticketPrice * passengers;
  const profit = revenue - fuel.cost;

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
    fuelCost: fuel.cost,
    ticketPrice,
    occupancy,
    passengers,
    revenue,
    profit,
    idle: false,
  };
}

// Aggregate totals for the daily report modal.
export function summarizeReport(rows) {
  return rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue;
      acc.fuelCost += r.fuelCost;
      acc.profit += r.profit;
      acc.passengers += r.passengers;
      if (!r.idle) acc.dispatched += 1;
      else acc.idle += 1;
      return acc;
    },
    { revenue: 0, fuelCost: 0, profit: 0, passengers: 0, dispatched: 0, idle: 0 }
  );
}
