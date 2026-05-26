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

const STARTING_CAPITAL = 800_000_000;

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
    createdAt: null,
  };
};

// Backfill new Phase 2 / 3 fields onto saves from older versions.
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
  // Marketing/Reviews subsystem (Part 2). Old saves do not have it, so we
  // backfill with a fresh structure — preserves base rating, no reviews.
  merged.marketing = {
    ...initialMarketingState(),
    ...(saved.marketing ?? {}),
  };
  return merged;
}

// --- Helpers used in several reducer branches -----------------------------

function unassignFromAllBuses(fleet, idKey, staffId) {
  return fleet.map((b) => (b[idKey] === staffId ? { ...b, [idKey]: null } : b));
}

// Given an active telemetry session and the legacy event payload, finalize
// the day: produce the daily report, apply per-bus / per-driver state
// changes, deduct inventory, and tick the market for tomorrow.
function finalizeFromTelemetry(state) {
  const session = state.activeTrip;
  if (!session) return state;

  const routesById = Object.fromEntries(state.routes.map((r) => [r.id, r]));
  const driversById = Object.fromEntries(state.drivers.map((d) => [d.id, d]));
  const kernetsById = Object.fromEntries(state.kernets.map((k) => [k.id, k]));
  const tiktokBoostActive = state.tiktokBoostDaysLeft > 0;

  // Resolve every dispatched bus into a report row using the telemetry
  // outcome (overheat / blowout overrides the random condition roll).
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

  const rows = [...tripRows, ...session.idleRows];
  const totals = summarizeReport(rows);

  // Marketing budget — paid per dispatched bus on the route. Players who
  // dispatched 5 buses on a Rp 250.000/day route pay Rp 1.250.000 today.
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

  // Inventory: pre-paid resources were already earmarked in the plan via
  // session.totalCost. Deduct now (broken-down buses still burn fuel/tires).
  // ALSO deduct any emergency pitstop tires that were consumed mid-trip.
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

  // Reviews + base-rating drift. Each completed dispatch generates at most
  // one review per bus; 1-stars trigger a 3-day shadowban.
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

  return {
    ...state,
    day: state.day + 1,
    balance: state.balance + totals.profit - marketingSpend,
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
    lastReport: {
      day: state.day,
      rows,
      totals,
      event: session.event,
      resourcesUsed: totalConsumed,
      marketingSpend,
      pitstopTires,
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
      const cost = points * (bt?.repairCostPerPoint ?? 200_000);
      if (state.balance < cost) return state;
      // Workshop service ALSO consumes 1 spare part if available — costs
      // are still mostly cash to avoid making bengkel a hard inventory
      // gate, but tactical players will care.
      const inventory = (state.inventory.parts ?? 0) > 0
        ? { ...state.inventory, parts: state.inventory.parts - 1 }
        : state.inventory;
      const fleet = state.fleet.map((b) =>
        b.id === action.busId
          ? { ...b, condition: CONDITION_MAX, inWorkshop: true }
          : b
      );
      return { ...state, balance: state.balance - cost, fleet, inventory };
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
      // Sell-back at 90% of current market — small spread punishes flipping.
      const price = state.marketPrices[assetId] ?? asset.basePrice;
      const revenue = Math.round(price * quantity * 0.9);
      return {
        ...state,
        balance: state.balance + revenue,
        inventory: deductInventory(state.inventory, { [assetId]: quantity }),
      };
    }

    // -- Dispatch flow ---------------------------------------------------
    case 'BEGIN_DISPATCH': {
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

      // No bus actually goes out today — emit an empty report immediately
      // (otherwise the Telemetry modal would just be a "settled" dialog
      // with nothing to watch).
      if (plan.frames.length === 0) {
        const totals = summarizeReport(plan.idleRows);
        // Still tick the market — a day passes either way.
        const next = tickMarket(state.marketPrices, state.priceHistory);
        return {
          ...state,
          day: state.day + 1,
          marketPrices: next.marketPrices,
          priceHistory: next.priceHistory,
          tiktokBoostDaysLeft: Math.max(0, state.tiktokBoostDaysLeft - 1),
          drivers: state.drivers.map((d) => ({
            ...d,
            stamina: Math.min(STAMINA_MAX, (d.stamina ?? 0) + STAMINA_REST_REGEN),
          })),
          lastReport: {
            day: state.day,
            rows: plan.idleRows,
            totals,
            event: null,
            resourcesUsed: { fuel: 0, tires: 0, parts: 0 },
            timestamp: Date.now(),
          },
        };
      }

      // Project of dispatchable buses for the event roller.
      const dispatchable = plan.frames.map((f) => ({
        busClass: f.busClass,
        driverSkill: f.driverSkill ?? 0,
      }));
      const event = rollRoadEvent(dispatchable);

      if (event && event.requiresChoice) {
        // Stash the plan; the telemetry session will start once the event
        // modal is resolved.
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
      // Must have at least 1 spare tire on hand.
      if ((state.inventory.tires ?? 0) <= 0) return state;
      const frames = applyFrameEmergencyPitstop(state.activeTrip.frames, action.busId);
      // Hold the tire deduction until finalize — frame.usedEmergencyPitstop
      // is the source of truth; finalizer adds it to totalConsumed.
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
    // Persist everything EXCEPT the live telemetry session — refreshing the
    // page mid-trip would put the reducer into an awkward state.
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
