import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { loadSave, writeSave, clearSave } from '../utils/storage';
import { generateId } from '../utils/id';
import { getBusType, CONDITION_MAX } from '../data/busTypes';
import { getCity } from '../data/cities';
import { getDistance } from '../data/distanceMatrix';
import {
  resolveTelemetryTrip,
  summarizeReport,
  rollRoadEvent,
} from '../utils/economics';
import {
  DRIVER_HIRE_COST,
  KERNET_HIRE_COST,
  STAMINA_MAX,
  STAMINA_REST_REGEN,
  driverTripSalary,
} from '../data/staff';
import {
  ASSETS,
  STARTING_INVENTORY,
  initialMarketState,
  tickMarket,
  addInventory,
  deductInventory,
} from '../utils/market';
import {
  buildDispatchPlan,
  tickAllTelemetry,
  isAllSettled,
  applyFrameSlowDown,
  applyFrameEmergencyPitstop,
} from '../utils/telemetry';
import {
  initialMarketingState,
  generateReview,
  applyReview,
  totalMarketingSpend,
  MAX_DAILY_AD_SPEND,
} from '../utils/marketing';
// Phase 3 (legacy track): Bank, Aset/Upgrades, Leaderboard, Game Over.
import {
  garageCapacity,
  nextGarageLevel,
  REST_AREA_CONTRACT,
  REST_AREA_PER_PASSENGER,
  INTERNAL_MECHANIC,
  INTERNAL_MECHANIC_DISCOUNT,
  discountedRepairCost,
} from '../data/upgrades';
import {
  MAX_LOAN_PRINCIPAL,
  MIN_LOAN_PRINCIPAL,
  loanInstallment,
  loanDailyDeduction,
  tickLoan,
} from '../data/bank';
import {
  initialRivalsState,
  tickRivals,
  computeRanking,
} from '../data/aiRivals';

const STARTING_CAPITAL = 800_000_000;
const STARTING_REPUTATION = 100;
const REPUTATION_MAX = 1000;
const PAILIT_GRACE_DAYS = 5;          // 5 days under Rp 0 -> Game Over
const CHAMPION_REPUTATION_FLOOR = 950; // need rep >= 950 + Rank #1 + 5+ buses

// --- Initial / empty state ------------------------------------------------

const emptyState = () => {
  const market = initialMarketState();
  return {
    poName: '',
    day: 1,
    balance: STARTING_CAPITAL,
    fleet: [],
    routes: [],
    drivers: [],
    kernets: [],
    lastReport: null,
    pendingDispatch: null,    // staged plan awaiting event choice
    pendingEvent: null,
    activeTrip: null,         // running telemetry session
    tiktokBoostDaysLeft: 0,
    inventory: { ...STARTING_INVENTORY },
    marketPrices: market.marketPrices,
    priceHistory: market.priceHistory,
    marketing: initialMarketingState(),
    // Phase 3 (legacy track) ----------------------------------------------
    loan: null,                       // { principal, remaining, installment, takenAtDay, totalPaid, totalInterestPaid, daysActive }
    upgrades: {
      garageLevel: 1,
      restAreaContract: false,
      internalMechanic: false,
    },
    reputation: STARTING_REPUTATION,
    rivals: initialRivalsState(),
    daysInDebt: 0,                    // consecutive days w/ balance < 0
    gameOver: null,                   // { reason: 'pailit' | 'champion', day, finalBalance, finalReputation, finalFleetSize }
    createdAt: null,
  };
};

// Backfill new fields onto saves from older versions. Both Phase 2/3 (AI
// Engine) AND legacy Phase 3 (Bank/Aset/Leaderboard) saves are normalized
// into the unified shape.
function migrateSave(saved) {
  if (!saved) return saved;
  const base = emptyState();
  const merged = { ...base, ...saved };
  merged.fleet = (saved.fleet ?? []).map((b) => ({
    condition: CONDITION_MAX,
    inWorkshop: false,
    assignedDriverId: null,
    assignedKernetId: null,
    ...b,
  }));
  merged.drivers = saved.drivers ?? [];
  merged.kernets = saved.kernets ?? [];
  merged.tiktokBoostDaysLeft = saved.tiktokBoostDaysLeft ?? 0;
  merged.pendingDispatch = saved.pendingDispatch ?? null;
  merged.pendingEvent = saved.pendingEvent ?? null;
  merged.activeTrip = null; // never persist a live telemetry session
  merged.inventory = { ...base.inventory, ...(saved.inventory ?? {}) };
  if (!saved.marketPrices || !saved.priceHistory) {
    merged.marketPrices = base.marketPrices;
    merged.priceHistory = base.priceHistory;
  } else {
    merged.marketPrices = saved.marketPrices;
    merged.priceHistory = saved.priceHistory;
  }
  // Marketing/Reviews subsystem — backfill with fresh structure if missing.
  merged.marketing = {
    ...initialMarketingState(),
    ...(saved.marketing ?? {}),
  };
  // Phase 3 legacy track (Bank/Aset/Leaderboard).
  merged.loan = saved.loan ?? null;
  merged.upgrades = { ...base.upgrades, ...(saved.upgrades ?? {}) };
  merged.reputation = saved.reputation ?? STARTING_REPUTATION;
  merged.rivals = (saved.rivals && saved.rivals.length > 0)
    ? saved.rivals
    : initialRivalsState();
  merged.daysInDebt = saved.daysInDebt ?? 0;
  merged.gameOver = saved.gameOver ?? null;
  return merged;
}

// --- Helpers --------------------------------------------------------------

function unassignFromAllBuses(fleet, idKey, staffId) {
  return fleet.map((b) => (b[idKey] === staffId ? { ...b, [idKey]: null } : b));
}

function clampReputation(value) {
  return Math.max(0, Math.min(REPUTATION_MAX, Math.round(value)));
}

// Reputation delta from a single dispatch. Combines the legacy heuristics
// (occupancy / mogok / event choice) with the new visibility-tier signals.
function reputationDeltaForDispatch(rows, event) {
  let delta = 0;
  for (const r of rows) {
    if (r.idle) continue;
    // Filling demand: +0..+5 per bus (occupancy * 5).
    delta += Math.round((r.occupancy ?? 0) * 5);
    // Predatory pricing: premium tariff with empty bus -> rep hit.
    if (r.strategy === 'premium' && (r.occupancy ?? 0) < 0.4) {
      delta -= 4;
    }
    // Mogok/crash = passengers stranded.
    if (r.crashed) delta -= 18;
    else if (r.breakdown) delta -= 10;
    // Top-page-1 visibility says "PO is talked about" -> +1.
    if (r.visibilityTier === 'top') delta += 1;
  }
  if (event?.id === 'razia' && event.choice === 'refuse') delta += 6;
  if (event?.id === 'razia' && event.choice === 'bribe') delta -= 2;
  if (event?.id === 'tiktok') delta += 5;
  if (event?.id === 'macet') delta -= 1;
  return delta;
}

// Game-over detection. Returns the new gameOver descriptor or null.
function detectGameOver(state, day, balance, reputation, fleet, rivals) {
  if (state.gameOver) return state.gameOver;
  const inDebt = balance < 0;
  const daysInDebt = inDebt ? state.daysInDebt + 1 : 0;
  if (daysInDebt >= PAILIT_GRACE_DAYS) {
    return {
      reason: 'pailit',
      day,
      finalBalance: balance,
      finalReputation: reputation,
      finalFleetSize: fleet.length,
    };
  }
  if (reputation >= CHAMPION_REPUTATION_FLOOR && fleet.length >= 5) {
    const ranking = computeRanking(
      { id: '__player', name: state.poName, reputation, fleet: fleet.length },
      rivals
    );
    const playerEntry = ranking.find((e) => e.isPlayer);
    if (playerEntry?.rank === 1) {
      return {
        reason: 'champion',
        day,
        finalBalance: balance,
        finalReputation: reputation,
        finalFleetSize: fleet.length,
      };
    }
  }
  return null;
}

// Given an active telemetry session, finalize the day:
//   - resolve every dispatched bus into a per-bus report row
//   - apply fleet/driver state changes
//   - charge inventory (incl. emergency pitstop tires)
//   - charge marketing ad spend
//   - generate reviews + apply shadowban
//   - apply Phase 3 ledger extras (rest area income, loan tick, internal
//     mechanic discount on breakdown fines, reputation drift, AI rivals tick)
//   - check game-over (pailit / champion)
function finalizeFromTelemetry(state) {
  const session = state.activeTrip;
  if (!session) return state;

  const routesById = Object.fromEntries(state.routes.map((r) => [r.id, r]));
  const driversById = Object.fromEntries(state.drivers.map((d) => [d.id, d]));
  const kernetsById = Object.fromEntries(state.kernets.map((k) => [k.id, k]));
  const tiktokBoostActive = state.tiktokBoostDaysLeft > 0;

  const tripRows = session.frames
    .map((frame) => {
      const bus = state.fleet.find((b) => b.id === frame.busId);
      if (!bus) return null;
      const route = routesById[frame.routeId];
      if (!route) return null;
      const driver = bus.assignedDriverId ? driversById[bus.assignedDriverId] : null;
      const kernet = bus.assignedKernetId ? kernetsById[bus.assignedKernetId] : null;
      return resolveTelemetryTrip(bus, route, frame, {
        driver,
        kernet,
        event: session.event,
        tiktokBoostActive,
      });
    })
    .filter(Boolean);

  // Apply internal-mechanic discount on any breakdown fines.
  if (state.upgrades.internalMechanic) {
    for (const r of tripRows) {
      if (r.repairFine && r.repairFine > 0) {
        const before = r.repairFine;
        const discounted = Math.round(before * (1 - INTERNAL_MECHANIC_DISCOUNT));
        const saved = before - discounted;
        r.repairFine = discounted;
        r.profit += saved;
        r.eventNotes = [
          ...(r.eventNotes ?? []),
          `🔧 Montir internal: denda mogok turun ${Math.round(INTERNAL_MECHANIC_DISCOUNT * 100)}% (-${formatRpQuick(saved)})`,
        ];
      }
    }
  }

  const rows = [...tripRows, ...session.idleRows];
  const totals = summarizeReport(rows);

  // Marketing budget — paid per dispatched bus on the route.
  const marketingSpend = totalMarketingSpend(state.marketing, session.frames);

  // Apply fleet condition + driver stamina changes.
  const fleet = state.fleet.map((bus) => {
    const row = rows.find((r) => r.busId === bus.id);
    if (!row || row.idle) return bus;
    return { ...bus, condition: row.conditionAfter };
  });
  const drivers = state.drivers.map((d) => {
    const row = rows.find((r) => r.driverId === d.id);
    if (row && !row.idle) {
      return { ...d, stamina: row.staminaAfter };
    }
    return {
      ...d,
      stamina: Math.min(STAMINA_MAX, (d.stamina ?? 0) + STAMINA_REST_REGEN),
    };
  });

  // Inventory + emergency-pitstop tires.
  const pitstopTires = session.frames.filter((f) => f.usedEmergencyPitstop).length;
  const totalConsumed = {
    fuel: session.totalCost.fuel,
    tires: session.totalCost.tires + pitstopTires,
    parts: session.totalCost.parts,
  };
  const inventory = deductInventory(state.inventory, totalConsumed);

  // Market: tick to tomorrow's prices.
  const next = tickMarket(state.marketPrices, state.priceHistory);

  // TikTok timer.
  let tiktokBoostDaysLeft = Math.max(0, state.tiktokBoostDaysLeft - 1);
  if (session.event?.id === 'tiktok') tiktokBoostDaysLeft = 3;

  // Reviews + base-rating drift (1-star triggers shadowban).
  let marketing = state.marketing ?? initialMarketingState();
  for (const row of tripRows) {
    if (row.idle) continue;
    const frame = session.frames.find((f) => f.busId === row.busId);
    const review = generateReview({
      frame,
      occupancy: row.occupancy,
      weatherOutcome: {
        usedSlowDown: row.usedSlowDown,
        usedEmergencyPitstop: row.usedEmergencyPitstop,
        weatherSurvivedBald: frame?.weatherSurvivedBald,
      },
      busName: row.busName,
      routeLabel: row.routeLabel,
      day: state.day,
    });
    if (review) {
      marketing = applyReview(marketing, review, state.day);
    }
  }

  // Phase 3 ledger extras ---------------------------------------------------

  // Driver vs kernet salary split (cosmetic only).
  let driverSalaries = 0;
  let kernetSalaries = 0;
  for (const r of tripRows) {
    if (r.idle) continue;
    if (r.driverId) driverSalaries += driverTripSalary(r.driverSkill ?? 5);
    if (r.kernetId) kernetSalaries += (r.salaries ?? 0) - driverTripSalary(r.driverSkill ?? 5);
  }
  if (driverSalaries + kernetSalaries !== totals.salaries) {
    driverSalaries = Math.max(0, totals.salaries - kernetSalaries);
  }

  // Rest-area passive income.
  const restAreaIncome = state.upgrades.restAreaContract
    ? totals.passengers * REST_AREA_PER_PASSENGER
    : 0;

  // Loan installment + interest deduction.
  const loanPayment = loanDailyDeduction(state.loan);
  const { loan: nextLoan } = tickLoan(state.loan);

  // Reputation update.
  const repDelta = reputationDeltaForDispatch(rows, session.event);
  const reputation = clampReputation(state.reputation + repDelta);

  // AI rivals tick.
  const newDay = state.day + 1;
  const rivals = tickRivals(state.rivals, newDay);

  // Net cash for the day = profit + rest area − marketing − loan.
  const netProfit =
    totals.profit + restAreaIncome - marketingSpend - loanPayment.total;
  const balanceBefore = state.balance;
  const balance = balanceBefore + netProfit;
  const inDebt = balance < 0;
  const daysInDebt = inDebt ? state.daysInDebt + 1 : 0;

  // Game over check (pailit after 5 days minus, OR champion at 950 rep + #1).
  const gameOver = detectGameOver(
    { ...state, daysInDebt },
    newDay,
    balance,
    reputation,
    fleet,
    rivals
  );

  return {
    ...state,
    day: newDay,
    balance,
    fleet,
    drivers,
    inventory,
    marketPrices: next.marketPrices,
    priceHistory: next.priceHistory,
    marketing,
    tiktokBoostDaysLeft,
    pendingDispatch: null,
    pendingEvent: null,
    activeTrip: null,
    loan: nextLoan,
    reputation,
    rivals,
    daysInDebt,
    gameOver,
    lastReport: {
      day: state.day,
      rows,
      totals,
      event: session.event,
      resourcesUsed: totalConsumed,
      marketingSpend,
      pitstopTires,
      timestamp: Date.now(),
      // Phase 3 ledger extras shown in the End-of-Day modal.
      ledger: {
        balanceBefore,
        balanceAfter: balance,
        revenue: totals.revenue,
        fuelCost: totals.fuelCost,
        driverSalaries,
        kernetSalaries,
        repairFine: totals.repairFine ?? 0,
        extraExpense: totals.extraExpense ?? 0,
        marketingSpend,
        restAreaIncome,
        loanInstallment: loanPayment.installment,
        loanInterest: loanPayment.interest,
        loanTotal: loanPayment.total,
        netProfit,
        reputationDelta: repDelta,
        reputationAfter: reputation,
        passengers: totals.passengers,
      },
    },
  };
}

function formatRpQuick(n) {
  if (n >= 1_000_000) return `Rp ${Math.round(n / 1_000_000)} Jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)} Rb`;
  return `Rp ${n}`;
}

// --- Reducer --------------------------------------------------------------

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE': {
      return { ...emptyState(), ...migrateSave(action.payload) };
    }

    case 'NEW_GAME': {
      return {
        ...emptyState(),
        poName: action.poName.trim() || 'PO Tanpa Nama',
        createdAt: Date.now(),
      };
    }

    case 'RESET': {
      return emptyState();
    }

    case 'BUY_BUS': {
      const { busTypeId, customName } = action;
      const bt = getBusType(busTypeId);
      if (!bt) return state;
      if (state.balance < bt.price) return state;

      // Garage capacity check (Phase 3 legacy).
      const cap = garageCapacity(state.upgrades.garageLevel);
      if (state.fleet.length >= cap) return state;

      const ordinal = state.fleet.length + 1;
      const fallbackName = `${bt.name.split(' / ')[0]} #${String(ordinal).padStart(2, '0')}`;
      const newBus = {
        id: generateId('bus'),
        name: (customName || '').trim() || fallbackName,
        class: bt.id,
        capacity: bt.capacity,
        fuelEfficiency: bt.fuelEfficiency,
        condition: CONDITION_MAX,
        inWorkshop: false,
        assignedRoute: null,
        assignedDriverId: null,
        assignedKernetId: null,
      };
      // Premium iron raises reputation a bit.
      const repBonus = bt.id === 'sleeper' ? 25 : bt.id === 'patas' ? 12 : 4;
      return {
        ...state,
        balance: state.balance - bt.price,
        fleet: [...state.fleet, newBus],
        reputation: clampReputation(state.reputation + repBonus),
      };
    }

    case 'SELL_BUS': {
      const bus = state.fleet.find((b) => b.id === action.busId);
      if (!bus) return state;
      const bt = getBusType(bus.class);
      const conditionFactor = (bus.condition ?? 100) / 100;
      const refund = Math.round((bt?.price ?? 0) * 0.6 * conditionFactor);
      const drivers = state.drivers.map((d) =>
        d.assignedBusId === bus.id ? { ...d, assignedBusId: null } : d
      );
      const kernets = state.kernets.map((k) =>
        k.assignedBusId === bus.id ? { ...k, assignedBusId: null } : k
      );
      return {
        ...state,
        balance: state.balance + refund,
        fleet: state.fleet.filter((b) => b.id !== action.busId),
        drivers,
        kernets,
      };
    }

    case 'ASSIGN_ROUTE': {
      const { busId, fromId, toId, strategy } = action;
      const bus = state.fleet.find((b) => b.id === busId);
      if (!bus) return state;
      const from = getCity(fromId);
      const to = getCity(toId);
      if (!from || !to || from.id === to.id) return state;
      const distanceKm = getDistance(from.id, to.id);
      if (!distanceKm) return state;
      const existing = state.routes.find(
        (r) => r.fromId === from.id && r.toId === to.id && r.strategy === strategy
      );
      const route = existing ?? {
        id: generateId('route'),
        fromId: from.id,
        fromName: from.name,
        toId: to.id,
        toName: to.name,
        distanceKm,
        strategy,
      };
      const routes = existing ? state.routes : [...state.routes, route];
      const fleet = state.fleet.map((b) =>
        b.id === busId ? { ...b, assignedRoute: route.id } : b
      );
      return { ...state, fleet, routes };
    }

    case 'UNASSIGN_ROUTE': {
      const fleet = state.fleet.map((b) =>
        b.id === action.busId ? { ...b, assignedRoute: null } : b
      );
      return { ...state, fleet };
    }

    // -- HR --------------------------------------------------------------
    case 'HIRE_DRIVER': {
      if (state.balance < DRIVER_HIRE_COST) return state;
      const driver = {
        id: generateId('drv'),
        name: action.candidate.name,
        skill: action.candidate.skill,
        stamina: STAMINA_MAX,
        salary: driverTripSalary(action.candidate.skill),
        assignedBusId: null,
      };
      return {
        ...state,
        balance: state.balance - DRIVER_HIRE_COST,
        drivers: [...state.drivers, driver],
      };
    }

    case 'FIRE_DRIVER': {
      const driver = state.drivers.find((d) => d.id === action.driverId);
      if (!driver) return state;
      return {
        ...state,
        drivers: state.drivers.filter((d) => d.id !== action.driverId),
        fleet: unassignFromAllBuses(state.fleet, 'assignedDriverId', driver.id),
      };
    }

    case 'HIRE_KERNET': {
      if (state.balance < KERNET_HIRE_COST) return state;
      const kernet = {
        id: generateId('krn'),
        name: action.candidate.name,
        salary: action.candidate.salary,
        assignedBusId: null,
      };
      return {
        ...state,
        balance: state.balance - KERNET_HIRE_COST,
        kernets: [...state.kernets, kernet],
      };
    }

    case 'FIRE_KERNET': {
      const kernet = state.kernets.find((k) => k.id === action.kernetId);
      if (!kernet) return state;
      return {
        ...state,
        kernets: state.kernets.filter((k) => k.id !== action.kernetId),
        fleet: unassignFromAllBuses(state.fleet, 'assignedKernetId', kernet.id),
      };
    }

    case 'ASSIGN_DRIVER': {
      const { busId, driverId } = action;
      const fleet = state.fleet.map((b) => {
        if (b.id === busId) return { ...b, assignedDriverId: driverId };
        if (b.assignedDriverId === driverId) return { ...b, assignedDriverId: null };
        return b;
      });
      const drivers = state.drivers.map((d) =>
        d.id === driverId
          ? { ...d, assignedBusId: busId }
          : d.assignedBusId === busId
          ? { ...d, assignedBusId: null }
          : d
      );
      return { ...state, fleet, drivers };
    }

    case 'UNASSIGN_DRIVER': {
      const { busId } = action;
      const bus = state.fleet.find((b) => b.id === busId);
      const driverId = bus?.assignedDriverId;
      const fleet = state.fleet.map((b) =>
        b.id === busId ? { ...b, assignedDriverId: null } : b
      );
      const drivers = state.drivers.map((d) =>
        d.id === driverId ? { ...d, assignedBusId: null } : d
      );
      return { ...state, fleet, drivers };
    }

    case 'ASSIGN_KERNET': {
      const { busId, kernetId } = action;
      const fleet = state.fleet.map((b) => {
        if (b.id === busId) return { ...b, assignedKernetId: kernetId };
        if (b.assignedKernetId === kernetId) return { ...b, assignedKernetId: null };
        return b;
      });
      const kernets = state.kernets.map((k) =>
        k.id === kernetId
          ? { ...k, assignedBusId: busId }
          : k.assignedBusId === busId
          ? { ...k, assignedBusId: null }
          : k
      );
      return { ...state, fleet, kernets };
    }

    case 'UNASSIGN_KERNET': {
      const { busId } = action;
      const bus = state.fleet.find((b) => b.id === busId);
      const kernetId = bus?.assignedKernetId;
      const fleet = state.fleet.map((b) =>
        b.id === busId ? { ...b, assignedKernetId: null } : b
      );
      const kernets = state.kernets.map((k) =>
        k.id === kernetId ? { ...k, assignedBusId: null } : k
      );
      return { ...state, fleet, kernets };
    }

    // -- Workshop --------------------------------------------------------
    case 'REPAIR_BUS': {
      const bus = state.fleet.find((b) => b.id === action.busId);
      if (!bus) return state;
      const bt = getBusType(bus.class);
      const points = CONDITION_MAX - (bus.condition ?? 100);
      if (points <= 0) return state;
      const rawCost = points * (bt?.repairCostPerPoint ?? 200_000);
      // Internal mechanic facility (Aset) gives a flat repair discount.
      const cost = discountedRepairCost(rawCost, state.upgrades.internalMechanic);
      if (state.balance < cost) return state;
      // Workshop service ALSO consumes 1 spare part if available.
      const inventory = (state.inventory.parts ?? 0) > 0
        ? { ...state.inventory, parts: state.inventory.parts - 1 }
        : state.inventory;
      const fleet = state.fleet.map((b) =>
        b.id === action.busId
          ? { ...b, condition: CONDITION_MAX, inWorkshop: true }
          : b
      );
      // Servicing helps reputation a touch — fleet visibly improves.
      return {
        ...state,
        balance: state.balance - cost,
        fleet,
        inventory,
        reputation: clampReputation(state.reputation + 1),
      };
    }

    // -- Market & Inventory ---------------------------------------------
    case 'BUY_ASSET': {
      const { assetId, quantity } = action;
      const asset = ASSETS[assetId];
      if (!asset || quantity <= 0) return state;
      const price = state.marketPrices[assetId] ?? asset.basePrice;
      const cost = price * quantity;
      if (state.balance < cost) return state;
      return {
        ...state,
        balance: state.balance - cost,
        inventory: addInventory(state.inventory, { [assetId]: quantity }),
      };
    }

    case 'SELL_ASSET': {
      const { assetId, quantity } = action;
      const asset = ASSETS[assetId];
      if (!asset || quantity <= 0) return state;
      if ((state.inventory[assetId] ?? 0) < quantity) return state;
      const price = state.marketPrices[assetId] ?? asset.basePrice;
      const revenue = Math.round(price * quantity * 0.9);
      return {
        ...state,
        balance: state.balance + revenue,
        inventory: deductInventory(state.inventory, { [assetId]: quantity }),
      };
    }

    // -- Bank ------------------------------------------------------------
    case 'APPLY_LOAN': {
      if (state.loan) return state;
      const principal = Math.max(0, Math.min(MAX_LOAN_PRINCIPAL, Math.round(action.principal)));
      if (principal < MIN_LOAN_PRINCIPAL) return state;
      return {
        ...state,
        balance: state.balance + principal,
        loan: {
          principal,
          remaining: principal,
          installment: loanInstallment(principal),
          takenAtDay: state.day,
          totalPaid: 0,
          totalInterestPaid: 0,
          daysActive: 0,
        },
      };
    }

    case 'REPAY_LOAN_FULL': {
      if (!state.loan) return state;
      if (state.balance < state.loan.remaining) return state;
      return {
        ...state,
        balance: state.balance - state.loan.remaining,
        loan: null,
      };
    }

    // -- Aset / Upgrades -------------------------------------------------
    case 'UPGRADE_GARAGE': {
      const next = nextGarageLevel(state.upgrades.garageLevel);
      if (!next) return state;
      if (state.balance < next.upgradeCost) return state;
      return {
        ...state,
        balance: state.balance - next.upgradeCost,
        upgrades: { ...state.upgrades, garageLevel: next.level },
        reputation: clampReputation(state.reputation + 8),
      };
    }

    case 'BUY_REST_AREA_CONTRACT': {
      if (state.upgrades.restAreaContract) return state;
      if (state.balance < REST_AREA_CONTRACT.cost) return state;
      return {
        ...state,
        balance: state.balance - REST_AREA_CONTRACT.cost,
        upgrades: { ...state.upgrades, restAreaContract: true },
        reputation: clampReputation(state.reputation + 6),
      };
    }

    case 'BUY_INTERNAL_MECHANIC': {
      if (state.upgrades.internalMechanic) return state;
      if (state.balance < INTERNAL_MECHANIC.cost) return state;
      return {
        ...state,
        balance: state.balance - INTERNAL_MECHANIC.cost,
        upgrades: { ...state.upgrades, internalMechanic: true },
        reputation: clampReputation(state.reputation + 6),
      };
    }

    // -- Dispatch flow ---------------------------------------------------
    case 'BEGIN_DISPATCH': {
      if (state.gameOver) return state;
      if (state.pendingEvent || state.activeTrip) return state;

      const routesById = Object.fromEntries(state.routes.map((r) => [r.id, r]));
      const driversById = Object.fromEntries(state.drivers.map((d) => [d.id, d]));
      const kernetsById = Object.fromEntries(state.kernets.map((k) => [k.id, k]));

      const plan = buildDispatchPlan({
        fleet: state.fleet,
        routesById,
        driversById,
        kernetsById,
        inventory: state.inventory,
        marketing: state.marketing,
        currentDay: state.day,
        tiktokBoostActive: state.tiktokBoostDaysLeft > 0,
      });

      // No bus actually goes out today — emit an empty report immediately.
      // Loan/rivals/reputation still tick because a day passes.
      if (plan.frames.length === 0) {
        const totals = summarizeReport(plan.idleRows);
        const next = tickMarket(state.marketPrices, state.priceHistory);
        const loanPayment = loanDailyDeduction(state.loan);
        const { loan: nextLoan } = tickLoan(state.loan);
        const newDay = state.day + 1;
        const rivals = tickRivals(state.rivals, newDay);
        const balance = state.balance - loanPayment.total;
        const inDebt = balance < 0;
        const daysInDebt = inDebt ? state.daysInDebt + 1 : 0;
        const reputation = clampReputation(state.reputation - 1); // idle PO loses tiny rep
        const gameOver = detectGameOver(
          { ...state, daysInDebt },
          newDay,
          balance,
          reputation,
          state.fleet,
          rivals
        );
        return {
          ...state,
          day: newDay,
          balance,
          marketPrices: next.marketPrices,
          priceHistory: next.priceHistory,
          tiktokBoostDaysLeft: Math.max(0, state.tiktokBoostDaysLeft - 1),
          drivers: state.drivers.map((d) => ({
            ...d,
            stamina: Math.min(STAMINA_MAX, (d.stamina ?? 0) + STAMINA_REST_REGEN),
          })),
          loan: nextLoan,
          rivals,
          daysInDebt,
          reputation,
          gameOver,
          lastReport: {
            day: state.day,
            rows: plan.idleRows,
            totals,
            event: null,
            resourcesUsed: { fuel: 0, tires: 0, parts: 0 },
            marketingSpend: 0,
            timestamp: Date.now(),
            ledger: {
              balanceBefore: state.balance,
              balanceAfter: balance,
              revenue: 0,
              fuelCost: 0,
              driverSalaries: 0,
              kernetSalaries: 0,
              repairFine: 0,
              extraExpense: 0,
              marketingSpend: 0,
              restAreaIncome: 0,
              loanInstallment: loanPayment.installment,
              loanInterest: loanPayment.interest,
              loanTotal: loanPayment.total,
              netProfit: -loanPayment.total,
              reputationDelta: -1,
              reputationAfter: reputation,
              passengers: 0,
            },
          },
        };
      }

      const dispatchable = plan.frames.map((f) => ({
        busClass: f.busClass,
        driverSkill: f.driverSkill ?? 0,
      }));
      const event = rollRoadEvent(dispatchable);

      if (event && event.requiresChoice) {
        return {
          ...state,
          pendingEvent: event,
          pendingDispatch: { plan, rolledAt: Date.now() },
        };
      }

      return {
        ...state,
        pendingEvent: null,
        pendingDispatch: null,
        activeTrip: {
          frames: plan.frames,
          idleRows: plan.idleRows,
          totalCost: plan.totalCost,
          event: event ?? null,
          status: 'running',
          startedAt: Date.now(),
        },
      };
    }

    case 'RESOLVE_EVENT': {
      if (!state.pendingEvent || !state.pendingDispatch) return state;
      const event = { ...state.pendingEvent, choice: action.choice ?? null };
      const plan = state.pendingDispatch.plan;
      return {
        ...state,
        pendingEvent: null,
        pendingDispatch: null,
        activeTrip: {
          frames: plan.frames,
          idleRows: plan.idleRows,
          totalCost: plan.totalCost,
          event,
          status: 'running',
          startedAt: Date.now(),
        },
      };
    }

    case 'TICK_TELEMETRY': {
      if (!state.activeTrip || state.activeTrip.status !== 'running') return state;
      const frames = tickAllTelemetry(state.activeTrip.frames);
      const status = isAllSettled(frames) ? 'settled' : 'running';
      return {
        ...state,
        activeTrip: { ...state.activeTrip, frames, status },
      };
    }

    // -- Radio "Race Control" interventions ------------------------------
    case 'RADIO_SLOW_DOWN': {
      if (!state.activeTrip || state.activeTrip.status !== 'running') return state;
      const frames = applyFrameSlowDown(state.activeTrip.frames, action.busId);
      return { ...state, activeTrip: { ...state.activeTrip, frames } };
    }

    case 'RADIO_EMERGENCY_PITSTOP': {
      if (!state.activeTrip || state.activeTrip.status !== 'running') return state;
      if ((state.inventory.tires ?? 0) <= 0) return state;
      const frames = applyFrameEmergencyPitstop(state.activeTrip.frames, action.busId);
      return { ...state, activeTrip: { ...state.activeTrip, frames } };
    }

    // -- Marketing budget bidding ---------------------------------------
    case 'SET_ROUTE_BUDGET': {
      const { routeId, budget } = action;
      if (!routeId) return state;
      const clamped = Math.max(0, Math.min(MAX_DAILY_AD_SPEND, Math.round(budget || 0)));
      const marketing = state.marketing ?? initialMarketingState();
      return {
        ...state,
        marketing: {
          ...marketing,
          routeBudgets: { ...marketing.routeBudgets, [routeId]: clamped },
        },
      };
    }

    case 'FINALIZE_TELEMETRY': {
      if (!state.activeTrip) return state;
      return finalizeFromTelemetry(state);
    }

    case 'CLEAR_REPORT': {
      const fleet = state.fleet.map((b) =>
        b.inWorkshop ? { ...b, inWorkshop: false } : b
      );
      return { ...state, lastReport: null, fleet };
    }

    case 'ACK_GAME_OVER': {
      return state; // GameOver modal calls resetGame() instead.
    }

    default:
      return state;
  }
}

// --- Provider -------------------------------------------------------------

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [hydrated, setHydrated] = useState(false);
  const [hasExistingSave, setHasExistingSave] = useState(false);
  const [state, dispatch] = useReducer(reducer, null, emptyState);

  useEffect(() => {
    const saved = loadSave();
    if (saved) setHasExistingSave(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!state.poName) return;
    // Persist everything EXCEPT the live telemetry session.
    const { activeTrip: _ignored, ...persistable } = state;
    writeSave(persistable);
  }, [state, hydrated]);

  const startNewGame = useCallback((poName) => {
    clearSave();
    dispatch({ type: 'NEW_GAME', poName });
    setHasExistingSave(true);
  }, []);

  const continueGame = useCallback(() => {
    const saved = loadSave();
    if (!saved) return false;
    dispatch({ type: 'HYDRATE', payload: saved });
    return true;
  }, []);

  const resetGame = useCallback(() => {
    clearSave();
    dispatch({ type: 'RESET' });
    setHasExistingSave(false);
  }, []);

  const buyBus = useCallback((busTypeId, customName) => {
    dispatch({ type: 'BUY_BUS', busTypeId, customName });
  }, []);
  const sellBus = useCallback((busId) => dispatch({ type: 'SELL_BUS', busId }), []);
  const assignRoute = useCallback((busId, fromId, toId, strategy) => {
    dispatch({ type: 'ASSIGN_ROUTE', busId, fromId, toId, strategy });
  }, []);
  const unassignRoute = useCallback((busId) => {
    dispatch({ type: 'UNASSIGN_ROUTE', busId });
  }, []);

  const beginDispatch = useCallback(() => dispatch({ type: 'BEGIN_DISPATCH' }), []);
  const resolveEvent = useCallback(
    (choice) => dispatch({ type: 'RESOLVE_EVENT', choice }),
    []
  );
  const tickTelemetry = useCallback(() => dispatch({ type: 'TICK_TELEMETRY' }), []);
  const finalizeTelemetry = useCallback(
    () => dispatch({ type: 'FINALIZE_TELEMETRY' }),
    []
  );
  const clearReport = useCallback(() => dispatch({ type: 'CLEAR_REPORT' }), []);

  // Race Control radio interventions.
  const radioSlowDown = useCallback(
    (busId) => dispatch({ type: 'RADIO_SLOW_DOWN', busId }),
    []
  );
  const radioEmergencyPitstop = useCallback(
    (busId) => dispatch({ type: 'RADIO_EMERGENCY_PITSTOP', busId }),
    []
  );

  // Marketing — daily ad-spend bid per route.
  const setRouteBudget = useCallback(
    (routeId, budget) => dispatch({ type: 'SET_ROUTE_BUDGET', routeId, budget }),
    []
  );

  // HR
  const hireDriver = useCallback((c) => dispatch({ type: 'HIRE_DRIVER', candidate: c }), []);
  const fireDriver = useCallback((id) => dispatch({ type: 'FIRE_DRIVER', driverId: id }), []);
  const hireKernet = useCallback((c) => dispatch({ type: 'HIRE_KERNET', candidate: c }), []);
  const fireKernet = useCallback((id) => dispatch({ type: 'FIRE_KERNET', kernetId: id }), []);
  const assignDriver = useCallback((busId, driverId) =>
    dispatch({ type: 'ASSIGN_DRIVER', busId, driverId }), []);
  const unassignDriver = useCallback((busId) =>
    dispatch({ type: 'UNASSIGN_DRIVER', busId }), []);
  const assignKernet = useCallback((busId, kernetId) =>
    dispatch({ type: 'ASSIGN_KERNET', busId, kernetId }), []);
  const unassignKernet = useCallback((busId) =>
    dispatch({ type: 'UNASSIGN_KERNET', busId }), []);

  // Workshop
  const repairBus = useCallback((busId) => dispatch({ type: 'REPAIR_BUS', busId }), []);

  // Market
  const buyAsset = useCallback((assetId, quantity) =>
    dispatch({ type: 'BUY_ASSET', assetId, quantity }), []);
  const sellAsset = useCallback((assetId, quantity) =>
    dispatch({ type: 'SELL_ASSET', assetId, quantity }), []);

  // Phase 3: Bank + Aset.
  const applyLoan = useCallback((principal) =>
    dispatch({ type: 'APPLY_LOAN', principal }), []);
  const repayLoanFull = useCallback(() =>
    dispatch({ type: 'REPAY_LOAN_FULL' }), []);
  const upgradeGarage = useCallback(() =>
    dispatch({ type: 'UPGRADE_GARAGE' }), []);
  const buyRestAreaContract = useCallback(() =>
    dispatch({ type: 'BUY_REST_AREA_CONTRACT' }), []);
  const buyInternalMechanic = useCallback(() =>
    dispatch({ type: 'BUY_INTERNAL_MECHANIC' }), []);

  const routesById = useMemo(
    () => Object.fromEntries(state.routes.map((r) => [r.id, r])),
    [state.routes]
  );
  const driversById = useMemo(
    () => Object.fromEntries(state.drivers.map((d) => [d.id, d])),
    [state.drivers]
  );
  const kernetsById = useMemo(
    () => Object.fromEntries(state.kernets.map((k) => [k.id, k])),
    [state.kernets]
  );
  const assignedCount = useMemo(
    () => state.fleet.filter((b) => b.assignedRoute && b.assignedDriverId).length,
    [state.fleet]
  );
  const garageCap = useMemo(
    () => garageCapacity(state.upgrades.garageLevel),
    [state.upgrades.garageLevel]
  );
  const ranking = useMemo(
    () =>
      computeRanking(
        {
          id: '__player',
          name: state.poName || 'PO Anda',
          reputation: state.reputation,
          fleet: state.fleet.length,
          blurb: 'PO milikmu — saatnya jadi Raja Pantura.',
        },
        state.rivals
      ),
    [state.poName, state.reputation, state.fleet.length, state.rivals]
  );

  const isGameStarted = Boolean(state.poName);

  const value = {
    state,
    hydrated,
    hasExistingSave,
    isGameStarted,
    routesById,
    driversById,
    kernetsById,
    assignedCount,
    garageCap,
    ranking,
    STARTING_CAPITAL,
    REPUTATION_MAX,
    PAILIT_GRACE_DAYS,
    // actions
    startNewGame,
    continueGame,
    resetGame,
    buyBus,
    sellBus,
    assignRoute,
    unassignRoute,
    beginDispatch,
    resolveEvent,
    tickTelemetry,
    finalizeTelemetry,
    clearReport,
    radioSlowDown,
    radioEmergencyPitstop,
    setRouteBudget,
    hireDriver,
    fireDriver,
    hireKernet,
    fireKernet,
    assignDriver,
    unassignDriver,
    assignKernet,
    unassignKernet,
    repairBus,
    buyAsset,
    sellAsset,
    // phase 3
    applyLoan,
    repayLoanFull,
    upgradeGarage,
    buyRestAreaContract,
    buyInternalMechanic,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame harus dipanggil di dalam <GameProvider>.');
  }
  return ctx;
}
