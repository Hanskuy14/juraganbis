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
import { resolveBusTrip, summarizeReport } from '../utils/economics';

const STARTING_CAPITAL = 800_000_000;

// --- Initial / empty state ------------------------------------------------

const emptyState = () => ({
  poName: '',
  day: 1,
  balance: STARTING_CAPITAL,
  fleet: [], // { id, name, class, capacity, fuelEfficiency, assignedRoute }
  routes: [], // { id, fromId, fromName, toId, toName, distanceKm, strategy }
  lastReport: null, // { day, rows, totals }
  createdAt: null,
});

// --- Reducer --------------------------------------------------------------

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE': {
      return { ...emptyState(), ...action.payload };
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
        assignedRoute: null,
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
      const refund = Math.round((bt?.price ?? 0) * 0.6); // 60% trade-in
      return {
        ...state,
        balance: state.balance + refund,
        fleet: state.fleet.filter((b) => b.id !== action.busId),
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

      // Reuse existing route record with the same shape if it already exists,
      // otherwise create a new route in the catalog.
      const existing = state.routes.find(
        (r) =>
          r.fromId === from.id &&
          r.toId === to.id &&
          r.strategy === strategy
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

    case 'DISPATCH': {
      const routesById = Object.fromEntries(state.routes.map((r) => [r.id, r]));
      const rows = state.fleet.map((bus) =>
        resolveBusTrip(bus, bus.assignedRoute ? routesById[bus.assignedRoute] : null)
      );
      const totals = summarizeReport(rows);
      return {
        ...state,
        day: state.day + 1,
        balance: state.balance + totals.profit,
        lastReport: {
          day: state.day,
          rows,
          totals,
          timestamp: Date.now(),
        },
      };
    }

    case 'CLEAR_REPORT': {
      return { ...state, lastReport: null };
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

  // Hydrate from localStorage exactly once on mount.
  useEffect(() => {
    const saved = loadSave();
    if (saved) {
      setHasExistingSave(true);
    }
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

  const buyBus = useCallback((busTypeId, customName) => {
    dispatch({ type: 'BUY_BUS', busTypeId, customName });
  }, []);

  const sellBus = useCallback((busId) => {
    dispatch({ type: 'SELL_BUS', busId });
  }, []);

  const assignRoute = useCallback((busId, fromId, toId, strategy) => {
    dispatch({ type: 'ASSIGN_ROUTE', busId, fromId, toId, strategy });
  }, []);

  const unassignRoute = useCallback((busId) => {
    dispatch({ type: 'UNASSIGN_ROUTE', busId });
  }, []);

  const dispatchDay = useCallback(() => {
    dispatch({ type: 'DISPATCH' });
  }, []);

  const clearReport = useCallback(() => {
    dispatch({ type: 'CLEAR_REPORT' });
  }, []);

  // Convenience selectors / derived data.
  const routesById = useMemo(
    () => Object.fromEntries(state.routes.map((r) => [r.id, r])),
    [state.routes]
  );
  const assignedCount = useMemo(
    () => state.fleet.filter((b) => b.assignedRoute).length,
    [state.fleet]
  );
  const isGameStarted = Boolean(state.poName);

  const value = {
    // raw
    state,
    hydrated,
    hasExistingSave,
    isGameStarted,
    routesById,
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
    dispatchDay,
    clearReport,
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
