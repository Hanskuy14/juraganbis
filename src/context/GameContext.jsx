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
  resolveBusTrip,
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
const PAILIT_GRACE_DAYS = 5;        // 5 days under Rp 0 -> Game Over
const CHAMPION_REPUTATION_FLOOR = 950; // need rep >= 950 to claim "Raja Pantura"

// --- Initial / empty state ------------------------------------------------

const emptyState = () => ({
  poName: '',
  day: 1,
  balance: STARTING_CAPITAL,
  fleet: [],
  routes: [],
  drivers: [],
  kernets: [],
  lastReport: null,
  pendingDispatch: null,
  pendingEvent: null,
  tiktokBoostDaysLeft: 0,
  // Phase 3 additions ------------------------------------------------------
  loan: null,                       // { principal, remaining, installment, takenAtDay, totalPaid, totalInterestPaid, daysActive }
  upgrades: {
    garageLevel: 1,
    restAreaContract: false,
    internalMechanic: false,
  },
  reputation: STARTING_REPUTATION,
  rivals: initialRivalsState(),
  daysInDebt: 0,                    // consecutive days w/ balance < 0
  gameOver: null,                   // { reason: 'pailit' | 'champion', day, finalBalance }
  createdAt: null,
});

// Backfill new fields onto saves from earlier phases.
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

// Reputation delta from a single dispatch. Tries to reward filling demand
// and resolving events properly; punishes mogok and predatory pricing.
function reputationDeltaForDispatch(rows, event) {
  let delta = 0;
  for (const r of rows) {
    if (r.idle) continue;
    // Filling passenger demand: +0..+5 per bus (occupancy * 5)
    delta += Math.round((r.occupancy ?? 0) * 5);
    // Predatory pricing: premium tariff with empty bus
    if (r.strategy === 'premium' && (r.occupancy ?? 0) < 0.4) {
      delta -= 4;
    }
    // Mogok = passengers stranded = reputation hit
    if (r.breakdown) delta -= 10;
  }
  if (event?.id === 'razia' && event.choice === 'refuse') delta += 6;
  if (event?.id === 'razia' && event.choice === 'bribe') delta -= 2;
  if (event?.id === 'tiktok') delta += 5;
  if (event?.id === 'macet') delta -= 1;
  return delta;
}

// Build trip rows + totals + Phase 3 ledger extras and apply them to state.
function executeDispatch(state, event) {
  const routesById = Object.fromEntries(state.routes.map((r) => [r.id, r]));
  const driversById = Object.fromEntries(state.drivers.map((d) => [d.id, d]));
  const kernetsById = Object.fromEntries(state.kernets.map((k) => [k.id, k]));
  const tiktokBoostActive = state.tiktokBoostDaysLeft > 0;
  const hasInternalMechanic = state.upgrades.internalMechanic;

  // 1. Run economics for each bus.
  const rows = state.fleet.map((bus) =>
    resolveBusTrip(
      bus,
      bus.assignedRoute ? routesById[bus.assignedRoute] : null,
      {
        driver: bus.assignedDriverId ? driversById[bus.assignedDriverId] : null,
        kernet: bus.assignedKernetId ? kernetsById[bus.assignedKernetId] : null,
        event,
        tiktokBoostActive,
      }
    )
  );

  // 1a. Apply internal-mechanic discount on breakdown fines that came back
  //     from the engine (it doesn't know about facility upgrades).
  if (hasInternalMechanic) {
    for (const r of rows) {
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

  const totals = summarizeReport(rows);

  // 2. Phase 3 ledger extras ---------------------------------------------

  // Driver vs kernet salary split — purely cosmetic for the End-of-Day modal.
  let driverSalaries = 0;
  let kernetSalaries = 0;
  for (const r of rows) {
    if (r.idle) continue;
    if (r.driverId) driverSalaries += driverTripSalary(r.driverSkill ?? 5);
    if (r.kernetId) kernetSalaries += (r.salaries ?? 0) - driverTripSalary(r.driverSkill ?? 5);
  }
  // Guard against rounding; fall back to "remaining" if math goes weird.
  if (driverSalaries + kernetSalaries !== totals.salaries) {
    driverSalaries = Math.max(0, totals.salaries - kernetSalaries);
  }

  // Rest area passive income (per passenger).
  const restAreaIncome = state.upgrades.restAreaContract
    ? totals.passengers * REST_AREA_PER_PASSENGER
    : 0;

  // Loan installment + interest deduction (one tick per BERANGKAT).
  const loanPayment = loanDailyDeduction(state.loan);
  const { loan: nextLoan } = tickLoan(state.loan);

  // Net cash change for the day.
  const netProfit =
    totals.profit + restAreaIncome - loanPayment.total;

  // 3. Persist per-bus state changes back onto fleet & drivers.
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
    return { ...d, stamina: Math.min(STAMINA_MAX, (d.stamina ?? 0) + STAMINA_REST_REGEN) };
  });

  // 4. TikTok boost timer.
  let tiktokBoostDaysLeft = Math.max(0, state.tiktokBoostDaysLeft - 1);
  if (event?.id === 'tiktok') tiktokBoostDaysLeft = 3;

  // 5. Reputation update.
  const repDelta = reputationDeltaForDispatch(rows, event);
  const reputation = clampReputation(state.reputation + repDelta);

  // 6. AI rivals tick.
  const newDay = state.day + 1;
  const rivals = tickRivals(state.rivals, newDay);

  // 7. Balance + game-over checks.
  const balanceBefore = state.balance;
  const balance = balanceBefore + netProfit;
  const inDebt = balance < 0;
  const daysInDebt = inDebt ? state.daysInDebt + 1 : 0;

  let gameOver = state.gameOver;
  if (!gameOver && daysInDebt >= PAILIT_GRACE_DAYS) {
    gameOver = {
      reason: 'pailit',
      day: newDay,
      finalBalance: balance,
      finalReputation: reputation,
      finalFleetSize: fleet.length,
    };
  }
  if (!gameOver && reputation >= CHAMPION_REPUTATION_FLOOR) {
    const ranking = computeRanking(
      { id: '__player', name: state.poName, reputation, fleet: fleet.length },
      rivals
    );
    const playerEntry = ranking.find((e) => e.isPlayer);
    if (playerEntry?.rank === 1 && fleet.length >= 5) {
      gameOver = {
        reason: 'champion',
        day: newDay,
        finalBalance: balance,
        finalReputation: reputation,
        finalFleetSize: fleet.length,
      };
    }
  }

  return {
    ...state,
    day: newDay,
    balance,
    fleet,
    drivers,
    tiktokBoostDaysLeft,
    pendingDispatch: null,
    pendingEvent: null,
    loan: nextLoan,
    reputation,
    rivals,
    daysInDebt,
    gameOver,
    lastReport: {
      day: state.day,
      rows,
      totals,
      event,
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

      // Garage capacity check.
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
      // Buying premium iron raises reputation a bit.
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
      const cost = discountedRepairCost(rawCost, state.upgrades.internalMechanic);
      if (state.balance < cost) return state;
      const fleet = state.fleet.map((b) =>
        b.id === action.busId
          ? { ...b, condition: CONDITION_MAX, inWorkshop: true }
          : b
      );
      // Servicing helps reputation a touch — the fleet visibly improves.
      return {
        ...state,
        balance: state.balance - cost,
        fleet,
        reputation: clampReputation(state.reputation + 1),
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

    // -- Upgrades --------------------------------------------------------
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
      if (state.pendingEvent || state.pendingDispatch) return state;

      const driversById = Object.fromEntries(state.drivers.map((d) => [d.id, d]));
      const dispatchable = state.fleet
        .filter((b) => b.assignedRoute && b.assignedDriverId && !b.inWorkshop)
        .map((b) => {
          const drv = driversById[b.assignedDriverId];
          if (!drv || (drv.stamina ?? 0) < 20) return null;
          return { busClass: b.class, driverSkill: drv?.skill ?? 0 };
        })
        .filter(Boolean);

      const event = rollRoadEvent(dispatchable);
      if (event) {
        return { ...state, pendingEvent: event, pendingDispatch: { rolledAt: Date.now() } };
      }
      return executeDispatch(state, null);
    }

    case 'RESOLVE_EVENT': {
      if (!state.pendingEvent) return state;
      const event = { ...state.pendingEvent, choice: action.choice ?? null };
      return executeDispatch(state, event);
    }

    case 'CLEAR_REPORT': {
      const fleet = state.fleet.map((b) =>
        b.inWorkshop ? { ...b, inWorkshop: false } : b
      );
      return { ...state, lastReport: null, fleet };
    }

    case 'ACK_GAME_OVER': {
      return state; // GameOver modal calls resetGame() instead
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
    writeSave(state);
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
  const resolveEvent = useCallback((choice) =>
    dispatch({ type: 'RESOLVE_EVENT', choice }), []);
  const clearReport = useCallback(() => dispatch({ type: 'CLEAR_REPORT' }), []);

  const hireDriver = useCallback((candidate) =>
    dispatch({ type: 'HIRE_DRIVER', candidate }), []);
  const fireDriver = useCallback((driverId) =>
    dispatch({ type: 'FIRE_DRIVER', driverId }), []);
  const hireKernet = useCallback((candidate) =>
    dispatch({ type: 'HIRE_KERNET', candidate }), []);
  const fireKernet = useCallback((kernetId) =>
    dispatch({ type: 'FIRE_KERNET', kernetId }), []);
  const assignDriver = useCallback((busId, driverId) =>
    dispatch({ type: 'ASSIGN_DRIVER', busId, driverId }), []);
  const unassignDriver = useCallback((busId) =>
    dispatch({ type: 'UNASSIGN_DRIVER', busId }), []);
  const assignKernet = useCallback((busId, kernetId) =>
    dispatch({ type: 'ASSIGN_KERNET', busId, kernetId }), []);
  const unassignKernet = useCallback((busId) =>
    dispatch({ type: 'UNASSIGN_KERNET', busId }), []);

  const repairBus = useCallback((busId) => dispatch({ type: 'REPAIR_BUS', busId }), []);

  // Phase 3 actions
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

  // Derived collections.
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
    clearReport,
    hireDriver,
    fireDriver,
    hireKernet,
    fireKernet,
    assignDriver,
    unassignDriver,
    assignKernet,
    unassignKernet,
    repairBus,
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
