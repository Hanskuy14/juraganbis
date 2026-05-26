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
import { getBusType } from '../data/busTypes';
import { getCity } from '../data/cities';
import { getDistance } from '../data/distanceMatrix';
import {
  resolveBusTrip,
  summarizeReport,
  aggregateBoostMultipliers,
  calculateRepairCost,
  STAMINA_REGEN_PER_DAY,
} from '../utils/economics';
import {
  rollDispatchEvent,
  resolveEventEffects,
  VIRAL_DEMAND_MULT,
  VIRAL_DURATION_DAYS,
} from '../utils/events';
import {
  driverFromCandidate,
  generateDriverCandidate,
  generateHRPool,
  generateKernetCandidate,
  kernetFromCandidate,
} from '../data/personnel';

const STARTING_CAPITAL = 800_000_000;

// --- Initial / empty state ------------------------------------------------

const emptyState = () => ({
  poName: '',
  day: 1,
  balance: STARTING_CAPITAL,
  fleet: [],
  // bus: { id, name, class, capacity, fuelEfficiency, assignedRoute,
  //        condition (0-100), status ('idle'|'in_service'),
  //        assignedDriver, assignedKernet }
  routes: [],
  drivers: [], // { id, name, skill, salary, stamina, assignedBus, tripsCompleted }
  kernets: [], // { id, name, charisma, salary, assignedBus }
  hrPool: { drivers: [], kernets: [] }, // candidates available to hire
  pendingEvent: null, // { id, ... } awaiting player choice / ack
  activeBoosts: [], // [{ id, type, daysLeft, demandMult, source }]
  lastReport: null,
  createdAt: null,
});

// --- Migration: old Phase 1 saves get default Phase 2 fields --------------

function migrateLoadedState(loaded) {
  const merged = { ...emptyState(), ...loaded };

  merged.fleet = (merged.fleet ?? []).map((b) => ({
    condition: 100,
    status: 'idle',
    assignedDriver: null,
    assignedKernet: null,
    ...b,
  }));
  merged.drivers = merged.drivers ?? [];
  merged.kernets = merged.kernets ?? [];
  if (
    !merged.hrPool ||
    !Array.isArray(merged.hrPool.drivers) ||
    !Array.isArray(merged.hrPool.kernets) ||
    merged.hrPool.drivers.length === 0
  ) {
    merged.hrPool = generateHRPool();
  }
  merged.pendingEvent = merged.pendingEvent ?? null;
  merged.activeBoosts = merged.activeBoosts ?? [];

  return merged;
}

// --- Helpers shared by reducer cases --------------------------------------

function newBusRecord(busType, customName, ordinal) {
  const fallbackName = `${busType.name.split(' / ')[0]} #${String(ordinal).padStart(2, '0')}`;
  return {
    id: generateId('bus'),
    name: (customName || '').trim() || fallbackName,
    class: busType.id,
    capacity: busType.capacity,
    fuelEfficiency: busType.fuelEfficiency,
    assignedRoute: null,
    assignedDriver: null,
    assignedKernet: null,
    condition: 100,
    status: 'idle',
  };
}

// Clear back-references on staff (for unassign / fire / sell).
function unlinkDriverFromBus(state, busId) {
  return state.drivers.map((d) =>
    d.assignedBus === busId ? { ...d, assignedBus: null } : d
  );
}
function unlinkKernetFromBus(state, busId) {
  return state.kernets.map((k) =>
    k.assignedBus === busId ? { ...k, assignedBus: null } : k
  );
}

// Core dispatch resolver. Used both for "no event" and "post-event" paths.
function runDispatchCore(state, eventCarryover) {
  const event = eventCarryover?.event ?? null;
  const choice = eventCarryover?.choice ?? null;
  const eventEffects = resolveEventEffects(event, choice);

  // Active boosts (e.g. Viral) compose with the per-event effects.
  const boostMods = aggregateBoostMultipliers(state.activeBoosts);
  const eventMods = {
    fuelMult: eventEffects.fuelMult,
    demandMult: eventEffects.demandMult * boostMods.demandMult,
  };

  const routesById = Object.fromEntries(state.routes.map((r) => [r.id, r]));
  const driversById = Object.fromEntries(state.drivers.map((d) => [d.id, d]));
  const kernetsById = Object.fromEntries(state.kernets.map((k) => [k.id, k]));

  // 1. Resolve every bus's trip outcome.
  const rows = state.fleet.map((bus) => {
    const route = bus.assignedRoute ? routesById[bus.assignedRoute] : null;
    const driver = bus.assignedDriver ? driversById[bus.assignedDriver] : null;
    const kernet = bus.assignedKernet ? kernetsById[bus.assignedKernet] : null;
    return resolveBusTrip(bus, route, { driver, kernet, eventMods });
  });

  const totals = summarizeReport(rows);

  // 2. Mutate fleet — apply condition damage and reset in_service flag.
  const fleet = state.fleet.map((bus) => {
    const row = rows.find((r) => r.busId === bus.id);
    let next = { ...bus };
    if (next.status === 'in_service') {
      // Refresh: bus emerges from workshop fully repaired the next day.
      next = { ...next, status: 'idle', condition: 100 };
    }
    if (row && !row.idle) {
      next.condition = Math.max(0, next.condition - row.conditionDamage);
    }
    return next;
  });

  // 3. Mutate drivers — used drivers lose stamina, others regen.
  const dispatchedDriverIds = new Set(
    rows.filter((r) => !r.idle && r.driverId).map((r) => r.driverId)
  );
  const drivers = state.drivers.map((d) => {
    if (dispatchedDriverIds.has(d.id)) {
      const row = rows.find((r) => r.driverId === d.id);
      return {
        ...d,
        stamina: Math.max(0, d.stamina - (row?.staminaUsed ?? 0)),
        tripsCompleted: (d.tripsCompleted ?? 0) + 1,
      };
    }
    return { ...d, stamina: Math.min(100, d.stamina + STAMINA_REGEN_PER_DAY) };
  });

  // 4. Money: sum of profit (already includes salary, fuel, kernet bonus,
  //    breakdown fines) + immediate event delta (bribe / razia fine).
  const newBalance = state.balance + totals.profit + eventEffects.immediateBalanceDelta;

  // 5. Active boosts: decrement existing, then activate Viral if event triggered.
  let activeBoosts = state.activeBoosts
    .map((b) => ({ ...b, daysLeft: b.daysLeft - 1 }))
    .filter((b) => b.daysLeft > 0);
  if (eventEffects.activateViral) {
    // Replace any existing viral boost with a fresh one (refresh duration).
    activeBoosts = [
      ...activeBoosts.filter((b) => b.type !== 'viral'),
      {
        id: generateId('boost'),
        type: 'viral',
        daysLeft: VIRAL_DURATION_DAYS,
        demandMult: VIRAL_DEMAND_MULT,
        source: 'Viral TikTok',
      },
    ];
  }

  // 6. Refresh HR pool: rotate one driver + one kernet candidate per day so
  //    the bursa lowongan never goes stale.
  const hrPool = {
    drivers: [
      ...state.hrPool.drivers.slice(1),
      generateDriverCandidate(),
    ],
    kernets: [
      ...state.hrPool.kernets.slice(1),
      generateKernetCandidate(),
    ],
  };

  return {
    ...state,
    day: state.day + 1,
    balance: newBalance,
    fleet,
    drivers,
    activeBoosts,
    hrPool,
    pendingEvent: null,
    lastReport: {
      day: state.day,
      rows,
      totals,
      event: event
        ? { ...event, choice, notes: eventEffects.notes }
        : null,
      timestamp: Date.now(),
    },
  };
}

// --- Reducer --------------------------------------------------------------

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return migrateLoadedState(action.payload);

    case 'NEW_GAME': {
      return {
        ...emptyState(),
        poName: action.poName.trim() || 'PO Tanpa Nama',
        hrPool: generateHRPool(),
        createdAt: Date.now(),
      };
    }

    case 'RESET':
      return emptyState();

    // --- Fleet ---
    case 'BUY_BUS': {
      const bt = getBusType(action.busTypeId);
      if (!bt) return state;
      if (state.balance < bt.price) return state;
      const ordinal = state.fleet.length + 1;
      return {
        ...state,
        balance: state.balance - bt.price,
        fleet: [...state.fleet, newBusRecord(bt, action.customName, ordinal)],
      };
    }
    case 'SELL_BUS': {
      const bus = state.fleet.find((b) => b.id === action.busId);
      if (!bus) return state;
      const bt = getBusType(bus.class);
      // Refund scales with condition (60% of price * condition%).
      const conditionFactor = (bus.condition ?? 100) / 100;
      const refund = Math.round((bt?.price ?? 0) * 0.6 * conditionFactor);
      return {
        ...state,
        balance: state.balance + refund,
        fleet: state.fleet.filter((b) => b.id !== action.busId),
        drivers: unlinkDriverFromBus(state, action.busId),
        kernets: unlinkKernetFromBus(state, action.busId),
      };
    }

    // --- Routes ---
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
      return {
        ...state,
        routes: existing ? state.routes : [...state.routes, route],
        fleet: state.fleet.map((b) =>
          b.id === busId ? { ...b, assignedRoute: route.id } : b
        ),
      };
    }
    case 'UNASSIGN_ROUTE':
      return {
        ...state,
        fleet: state.fleet.map((b) =>
          b.id === action.busId ? { ...b, assignedRoute: null } : b
        ),
      };

    // --- HR ---
    case 'HIRE_DRIVER': {
      const cand = state.hrPool.drivers.find(
        (c) => c.candidateId === action.candidateId
      );
      if (!cand) return state;
      return {
        ...state,
        drivers: [...state.drivers, driverFromCandidate(cand)],
        hrPool: {
          ...state.hrPool,
          drivers: state.hrPool.drivers.map((c) =>
            c.candidateId === action.candidateId ? generateDriverCandidate() : c
          ),
        },
      };
    }
    case 'HIRE_KERNET': {
      const cand = state.hrPool.kernets.find(
        (c) => c.candidateId === action.candidateId
      );
      if (!cand) return state;
      return {
        ...state,
        kernets: [...state.kernets, kernetFromCandidate(cand)],
        hrPool: {
          ...state.hrPool,
          kernets: state.hrPool.kernets.map((c) =>
            c.candidateId === action.candidateId ? generateKernetCandidate() : c
          ),
        },
      };
    }
    case 'FIRE_DRIVER': {
      const drv = state.drivers.find((d) => d.id === action.driverId);
      if (!drv) return state;
      // If assigned, remove the back-reference from bus.
      const fleet = drv.assignedBus
        ? state.fleet.map((b) =>
            b.id === drv.assignedBus ? { ...b, assignedDriver: null } : b
          )
        : state.fleet;
      return {
        ...state,
        fleet,
        drivers: state.drivers.filter((d) => d.id !== action.driverId),
      };
    }
    case 'FIRE_KERNET': {
      const krn = state.kernets.find((k) => k.id === action.kernetId);
      if (!krn) return state;
      const fleet = krn.assignedBus
        ? state.fleet.map((b) =>
            b.id === krn.assignedBus ? { ...b, assignedKernet: null } : b
          )
        : state.fleet;
      return {
        ...state,
        fleet,
        kernets: state.kernets.filter((k) => k.id !== action.kernetId),
      };
    }
    case 'ASSIGN_DRIVER': {
      const { busId, driverId } = action;
      // Detach this driver from any other bus, and detach old driver from this bus.
      const drivers = state.drivers.map((d) => {
        if (d.id === driverId) return { ...d, assignedBus: busId };
        if (d.assignedBus === busId) return { ...d, assignedBus: null };
        return d;
      });
      const fleet = state.fleet.map((b) => {
        if (b.id === busId) return { ...b, assignedDriver: driverId };
        const drvOnB = drivers.find((d) => d.id === driverId);
        // If the new driver was previously on a different bus, clear that.
        if (drvOnB && b.assignedDriver === driverId && b.id !== busId) {
          return { ...b, assignedDriver: null };
        }
        return b;
      });
      return { ...state, drivers, fleet };
    }
    case 'UNASSIGN_DRIVER': {
      const bus = state.fleet.find((b) => b.id === action.busId);
      if (!bus || !bus.assignedDriver) return state;
      return {
        ...state,
        fleet: state.fleet.map((b) =>
          b.id === action.busId ? { ...b, assignedDriver: null } : b
        ),
        drivers: state.drivers.map((d) =>
          d.assignedBus === action.busId ? { ...d, assignedBus: null } : d
        ),
      };
    }
    case 'ASSIGN_KERNET': {
      const { busId, kernetId } = action;
      const kernets = state.kernets.map((k) => {
        if (k.id === kernetId) return { ...k, assignedBus: busId };
        if (k.assignedBus === busId) return { ...k, assignedBus: null };
        return k;
      });
      const fleet = state.fleet.map((b) =>
        b.id === busId ? { ...b, assignedKernet: kernetId } : b
      );
      return { ...state, kernets, fleet };
    }
    case 'UNASSIGN_KERNET': {
      const bus = state.fleet.find((b) => b.id === action.busId);
      if (!bus || !bus.assignedKernet) return state;
      return {
        ...state,
        fleet: state.fleet.map((b) =>
          b.id === action.busId ? { ...b, assignedKernet: null } : b
        ),
        kernets: state.kernets.map((k) =>
          k.assignedBus === action.busId ? { ...k, assignedBus: null } : k
        ),
      };
    }
    case 'REFRESH_HR_POOL':
      return { ...state, hrPool: generateHRPool() };

    // --- Workshop ---
    case 'REPAIR_BUS': {
      const bus = state.fleet.find((b) => b.id === action.busId);
      if (!bus) return state;
      const cost = calculateRepairCost(bus.condition);
      if (state.balance < cost) return state;
      return {
        ...state,
        balance: state.balance - cost,
        fleet: state.fleet.map((b) =>
          b.id === action.busId
            ? { ...b, status: 'in_service' } // condition refreshed AFTER dispatch
            : b
        ),
      };
    }
    case 'CANCEL_REPAIR': {
      // Lets a player undo a workshop booking before pressing BERANGKAT (no refund needed
      // because we only record status; condition snap-back happens in dispatch).
      // We refund the amount we deducted to keep this consistent.
      const bus = state.fleet.find((b) => b.id === action.busId);
      if (!bus || bus.status !== 'in_service') return state;
      const cost = calculateRepairCost(bus.condition);
      return {
        ...state,
        balance: state.balance + cost,
        fleet: state.fleet.map((b) =>
          b.id === action.busId ? { ...b, status: 'idle' } : b
        ),
      };
    }

    // --- Dispatch flow ---
    case 'BEGIN_DISPATCH': {
      // Roll the event. ALL events route through pendingEvent so the player
      // gets a modal to acknowledge or choose, then RESOLVE_EVENT triggers
      // the actual dispatch.
      const event = rollDispatchEvent(state);
      if (event) {
        return { ...state, pendingEvent: event };
      }
      return runDispatchCore(state, null);
    }
    case 'RESOLVE_EVENT': {
      const event = state.pendingEvent;
      if (!event) return state;
      return runDispatchCore(state, { event, choice: action.choice });
    }
    case 'CLEAR_REPORT':
      return { ...state, lastReport: null };

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

  // Hydrate from localStorage exactly once on mount.
  useEffect(() => {
    const saved = loadSave();
    if (saved) setHasExistingSave(true);
    setHydrated(true);
  }, []);

  // Persist on every change — but only after a game has actually started.
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

  // Fleet
  const buyBus = useCallback((busTypeId, customName) => {
    dispatch({ type: 'BUY_BUS', busTypeId, customName });
  }, []);
  const sellBus = useCallback((busId) => {
    dispatch({ type: 'SELL_BUS', busId });
  }, []);

  // Routes
  const assignRoute = useCallback((busId, fromId, toId, strategy) => {
    dispatch({ type: 'ASSIGN_ROUTE', busId, fromId, toId, strategy });
  }, []);
  const unassignRoute = useCallback((busId) => {
    dispatch({ type: 'UNASSIGN_ROUTE', busId });
  }, []);

  // HR
  const hireDriver = useCallback((candidateId) => {
    dispatch({ type: 'HIRE_DRIVER', candidateId });
  }, []);
  const fireDriver = useCallback((driverId) => {
    dispatch({ type: 'FIRE_DRIVER', driverId });
  }, []);
  const hireKernet = useCallback((candidateId) => {
    dispatch({ type: 'HIRE_KERNET', candidateId });
  }, []);
  const fireKernet = useCallback((kernetId) => {
    dispatch({ type: 'FIRE_KERNET', kernetId });
  }, []);
  const assignDriver = useCallback((busId, driverId) => {
    dispatch({ type: 'ASSIGN_DRIVER', busId, driverId });
  }, []);
  const unassignDriver = useCallback((busId) => {
    dispatch({ type: 'UNASSIGN_DRIVER', busId });
  }, []);
  const assignKernet = useCallback((busId, kernetId) => {
    dispatch({ type: 'ASSIGN_KERNET', busId, kernetId });
  }, []);
  const unassignKernet = useCallback((busId) => {
    dispatch({ type: 'UNASSIGN_KERNET', busId });
  }, []);
  const refreshHRPool = useCallback(() => {
    dispatch({ type: 'REFRESH_HR_POOL' });
  }, []);

  // Workshop
  const repairBus = useCallback((busId) => {
    dispatch({ type: 'REPAIR_BUS', busId });
  }, []);
  const cancelRepair = useCallback((busId) => {
    dispatch({ type: 'CANCEL_REPAIR', busId });
  }, []);

  // Dispatch flow
  const beginDispatch = useCallback(() => {
    dispatch({ type: 'BEGIN_DISPATCH' });
  }, []);
  const resolveEvent = useCallback((choice) => {
    dispatch({ type: 'RESOLVE_EVENT', choice });
  }, []);
  const clearReport = useCallback(() => {
    dispatch({ type: 'CLEAR_REPORT' });
  }, []);

  // Selectors / derived data.
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
    () =>
      state.fleet.filter(
        (b) =>
          b.assignedRoute &&
          b.assignedDriver &&
          b.status !== 'in_service'
      ).length,
    [state.fleet]
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
    STARTING_CAPITAL,
    // actions
    startNewGame,
    continueGame,
    resetGame,
    buyBus,
    sellBus,
    assignRoute,
    unassignRoute,
    hireDriver,
    fireDriver,
    hireKernet,
    fireKernet,
    assignDriver,
    unassignDriver,
    assignKernet,
    unassignKernet,
    refreshHRPool,
    repairBus,
    cancelRepair,
    beginDispatch,
    resolveEvent,
    clearReport,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame harus dipanggil di dalam <GameProvider>.');
  return ctx;
}
