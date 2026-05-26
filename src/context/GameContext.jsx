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

const STARTING_CAPITAL = 800_000_000;

// --- Initial / empty state ------------------------------------------------

const emptyState = () => ({
  poName: '',
  day: 1,
  balance: STARTING_CAPITAL,
  fleet: [],            // { id, name, class, capacity, fuelEfficiency, condition,
                        //   inWorkshop, assignedRoute, assignedDriverId, assignedKernetId }
  routes: [],           // { id, fromId, fromName, toId, toName, distanceKm, strategy }
  drivers: [],          // { id, name, skill, stamina, salary, assignedBusId }
  kernets: [],          // { id, name, salary, assignedBusId }
  lastReport: null,     // { day, rows, totals }
  pendingDispatch: null, // staged trips awaiting event choice
  pendingEvent: null,   // road event needing user resolution / acknowledgement
  tiktokBoostDaysLeft: 0,
  createdAt: null,
});

// Backfill new Phase 2 fields onto saves from Phase 1.
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
  return merged;
}

// --- Helpers used in several reducer branches -----------------------------

function unassignFromAllBuses(fleet, idKey, staffId) {
  return fleet.map((b) => (b[idKey] === staffId ? { ...b, [idKey]: null } : b));
}

// Build the actual trip rows + totals from state. Used by both
// COMMIT_DISPATCH (no event) and RESOLVE_EVENT.
function executeDispatch(state, event) {
  const routesById = Object.fromEntries(state.routes.map((r) => [r.id, r]));
  const driversById = Object.fromEntries(state.drivers.map((d) => [d.id, d]));
  const kernetsById = Object.fromEntries(state.kernets.map((k) => [k.id, k]));
  const tiktokBoostActive = state.tiktokBoostDaysLeft > 0;

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
  const totals = summarizeReport(rows);

  // Apply per-row state changes back onto fleet & drivers.
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
    // Drivers who didn't drive today -> rest regen.
    return { ...d, stamina: Math.min(STAMINA_MAX, (d.stamina ?? 0) + STAMINA_REST_REGEN) };
  });

  // TikTok timer: tick down each day, but if THIS dispatch triggered tiktok,
  // refresh to 3 days starting next day.
  let tiktokBoostDaysLeft = Math.max(0, state.tiktokBoostDaysLeft - 1);
  if (event?.id === 'tiktok') tiktokBoostDaysLeft = 3;

  return {
    ...state,
    day: state.day + 1,
    balance: state.balance + totals.profit,
    fleet,
    drivers,
    tiktokBoostDaysLeft,
    pendingDispatch: null,
    pendingEvent: null,
    lastReport: {
      day: state.day,
      rows,
      totals,
      event,
      timestamp: Date.now(),
    },
  };
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
      return {
        ...state,
        balance: state.balance - bt.price,
        fleet: [...state.fleet, newBus],
      };
    }

    case 'SELL_BUS': {
      const bus = state.fleet.find((b) => b.id === action.busId);
      if (!bus) return state;
      const bt = getBusType(bus.class);
      // Refund scales with condition: full 60% only at 100% condition.
      const conditionFactor = (bus.condition ?? 100) / 100;
      const refund = Math.round((bt?.price ?? 0) * 0.6 * conditionFactor);

      // Free up the assigned crew.
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
      // Detach driverId from any bus that had it; attach to busId.
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
      const cost = points * (bt?.repairCostPerPoint ?? 200_000);
      if (state.balance < cost) return state;
      const fleet = state.fleet.map((b) =>
        b.id === action.busId
          ? { ...b, condition: CONDITION_MAX, inWorkshop: true }
          : b
      );
      return { ...state, balance: state.balance - cost, fleet };
    }

    // -- Dispatch flow ---------------------------------------------------
    case 'BEGIN_DISPATCH': {
      // If a flow is already pending, ignore.
      if (state.pendingEvent || state.pendingDispatch) return state;

      // Quick projection of which buses would actually go out, used by the
      // event roller (e.g., to decide if "tiktok" is eligible).
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
      // Also clears any leftover end-of-day workshop flags so buses are
      // available again the morning after.
      const fleet = state.fleet.map((b) =>
        b.inWorkshop ? { ...b, inWorkshop: false } : b
      );
      return { ...state, lastReport: null, fleet };
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

  // HR
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

  // Workshop
  const repairBus = useCallback((busId) => dispatch({ type: 'REPAIR_BUS', busId }), []);

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
