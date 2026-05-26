// Macro-economic AI engine: a mean-reverting random walk over 3 commodities.
// Each in-game "day" the prices tick once. Players are expected to "buy the
// dip" — stockpile when prices crash, hold off when they spike.
//
// Pure functions only. State is owned by GameContext.

// --- Asset catalog --------------------------------------------------------

export const ASSETS = {
  fuel: {
    id: 'fuel',
    name: 'Solar',
    longName: 'Solar (Diesel)',
    unit: 'L',
    unitLabel: 'liter',
    icon: '⛽',
    basePrice: 10_000,        // Rp / liter (the old fixed price)
    volatility: 0.04,         // ~4% daily sigma
    drift: 0.06,              // mean-reversion strength toward base
    minMult: 0.55,            // never below 55% of base
    maxMult: 1.85,            // never above 185% of base
    accent: 'from-rose-500/25 to-rose-500/5',
    badge: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
    chart: '#fb7185',
  },
  tires: {
    id: 'tires',
    name: 'Ban Cadangan',
    longName: 'Ban Cadangan',
    unit: 'pcs',
    unitLabel: 'piece',
    icon: '🛞',
    basePrice: 1_500_000,     // Rp / piece
    volatility: 0.06,
    drift: 0.05,
    minMult: 0.50,
    maxMult: 2.00,
    accent: 'from-sky-500/25 to-sky-500/5',
    badge: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
    chart: '#38bdf8',
  },
  parts: {
    id: 'parts',
    name: 'Suku Cadang',
    longName: 'Suku Cadang Mesin',
    unit: 'pcs',
    unitLabel: 'piece',
    icon: '🔧',
    basePrice: 2_500_000,     // Rp / piece
    volatility: 0.075,
    drift: 0.04,
    minMult: 0.45,
    maxMult: 2.20,
    accent: 'from-amber-500/25 to-amber-500/5',
    badge: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
    chart: '#fbbf24',
  },
};

export const ASSET_LIST = Object.values(ASSETS);

// History window kept on the client. The chart only needs the last 7 days
// but we keep 14 internally so trend metrics (avg, hi/lo) feel meaningful.
export const PRICE_HISTORY_LEN = 14;

// --- Initial inventory & market state -------------------------------------

// What every fresh PO starts with so the very first dispatch never gets
// blocked by an empty warehouse.
export const STARTING_INVENTORY = {
  fuel: 1_000,    // ~enough for 4 long-haul trips
  tires: 10,      // covers ~10 long-haul trips
  parts: 5,       // covers ~5 long-haul trips
};

// Generate a believable 7-day price series ending exactly at base price so
// new players see a calm chart, not pre-loaded chaos.
function seedHistoryFor(asset) {
  const len = 7;
  const series = [];
  let p = asset.basePrice;
  for (let i = 0; i < len; i += 1) {
    const shock = (Math.random() - 0.5) * 2 * asset.volatility * 0.6;
    p = clampToBand(asset, p * (1 + shock));
    series.push(Math.round(p));
  }
  // Snap last point to base price for predictable starting condition.
  series[series.length - 1] = asset.basePrice;
  return series;
}

export function initialMarketState() {
  const marketPrices = {};
  const priceHistory = {};
  ASSET_LIST.forEach((a) => {
    const seeded = seedHistoryFor(a);
    marketPrices[a.id] = seeded[seeded.length - 1];
    priceHistory[a.id] = seeded;
  });
  return { marketPrices, priceHistory };
}

// --- Random walk tick -----------------------------------------------------

function clampToBand(asset, raw) {
  const lo = asset.basePrice * asset.minMult;
  const hi = asset.basePrice * asset.maxMult;
  return Math.max(lo, Math.min(hi, raw));
}

// Box-Muller-ish: sum 3 uniforms for a vaguely normal-ish distribution.
// We don't need full stats rigor — we want occasional spikes that feel
// punchy without being pathological.
function gauss() {
  return ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 2;
}

export function nextPrice(prevPrice, asset) {
  const meanReversion = ((asset.basePrice - prevPrice) / asset.basePrice) * asset.drift;
  const shock = gauss() * asset.volatility;
  const next = prevPrice * (1 + meanReversion + shock);
  return Math.round(clampToBand(asset, next));
}

// Advance ALL three assets one in-game day. Returns the next market state.
// Both inputs are objects keyed by asset id.
export function tickMarket(prevPrices, prevHistory) {
  const marketPrices = {};
  const priceHistory = {};
  ASSET_LIST.forEach((a) => {
    const prev = prevPrices?.[a.id] ?? a.basePrice;
    const next = nextPrice(prev, a);
    marketPrices[a.id] = next;
    const h = [...(prevHistory?.[a.id] ?? [a.basePrice]), next];
    if (h.length > PRICE_HISTORY_LEN) h.splice(0, h.length - PRICE_HISTORY_LEN);
    priceHistory[a.id] = h;
  });
  return { marketPrices, priceHistory };
}

// --- Trend / chart helpers -------------------------------------------------

// Last 7 entries of a series — for the candle/line chart on the market tab.
export function lastNPrices(series, n = 7) {
  if (!series) return [];
  return series.slice(-n);
}

export function priceTrend(series) {
  if (!series || series.length < 2) return { delta: 0, ratio: 0, direction: 'flat' };
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const delta = last - prev;
  const ratio = prev === 0 ? 0 : delta / prev;
  let direction = 'flat';
  if (ratio > 0.005) direction = 'up';
  else if (ratio < -0.005) direction = 'down';
  return { delta, ratio, direction };
}

// Returns {min, max} across the visible window — used to compute chart Y.
export function priceWindow(series) {
  const xs = series ?? [];
  if (xs.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (min === max) return { min: min * 0.95, max: max * 1.05 };
  return { min, max };
}

// Where this asset sits relative to its own historical band: 0 = at min,
// 1 = at max. Used to colour the "Buy the Dip" hint.
export function relativeBand(price, asset) {
  const lo = asset.basePrice * asset.minMult;
  const hi = asset.basePrice * asset.maxMult;
  return Math.max(0, Math.min(1, (price - lo) / (hi - lo)));
}

// Verdict label for the player — quick "is this cheap or expensive?" call.
export function priceVerdict(price, asset) {
  const r = price / asset.basePrice;
  if (r <= 0.85) return { label: 'MURAH BANGET', tone: 'text-emerald-300', advice: 'Borong sekarang.' };
  if (r <= 0.97) return { label: 'Lebih murah', tone: 'text-emerald-200', advice: 'Bagus buat stok.' };
  if (r <= 1.03) return { label: 'Harga normal', tone: 'text-white/70', advice: 'Aman aja.' };
  if (r <= 1.18) return { label: 'Lebih mahal', tone: 'text-amber-300', advice: 'Tahan dulu kalau bisa.' };
  return { label: 'MAHAL BANGET', tone: 'text-rose-300', advice: 'Hindari beli sekarang.' };
}

// --- Trip resource consumption -------------------------------------------

// What a single trip will eat from the warehouse. The fuel formula matches
// the legacy economics.js so existing previews stay accurate.
//
//   fuel:  liters = ceil(distance / fuelEfficiency)
//   tires: 1 piece if distance >= 300 km
//   parts: 1 piece if distance >= 500 km
//
// Short hops therefore only burn fuel — long-haul trips are the ones that
// stress the spare-parts inventory.
export function tripResourceCost({ distanceKm, fuelEfficiency }) {
  if (!distanceKm || !fuelEfficiency) {
    return { fuel: 0, tires: 0, parts: 0 };
  }
  return {
    fuel: Math.ceil(distanceKm / fuelEfficiency),
    tires: distanceKm >= 300 ? 1 : 0,
    parts: distanceKm >= 500 ? 1 : 0,
  };
}

// True if `inventory` covers `cost` (per-asset >=).
export function hasInventoryFor(inventory, cost) {
  if (!inventory || !cost) return false;
  return (
    (inventory.fuel ?? 0) >= cost.fuel &&
    (inventory.tires ?? 0) >= cost.tires &&
    (inventory.parts ?? 0) >= cost.parts
  );
}

// Subtract `cost` from `inventory`. Returns a new object; caller decides
// whether to clamp to >=0 (we floor at 0 for safety).
export function deductInventory(inventory, cost) {
  return {
    fuel: Math.max(0, (inventory.fuel ?? 0) - (cost.fuel ?? 0)),
    tires: Math.max(0, (inventory.tires ?? 0) - (cost.tires ?? 0)),
    parts: Math.max(0, (inventory.parts ?? 0) - (cost.parts ?? 0)),
  };
}

export function addInventory(inventory, delta) {
  return {
    fuel: Math.max(0, (inventory.fuel ?? 0) + (delta.fuel ?? 0)),
    tires: Math.max(0, (inventory.tires ?? 0) + (delta.tires ?? 0)),
    parts: Math.max(0, (inventory.parts ?? 0) + (delta.parts ?? 0)),
  };
}

// Diagnostic: which assets are short for this cost? Returns array of
// asset ids that are insufficient (empty array = good to go).
export function inventoryShortfall(inventory, cost) {
  const out = [];
  if ((inventory.fuel ?? 0) < (cost.fuel ?? 0)) out.push('fuel');
  if ((inventory.tires ?? 0) < (cost.tires ?? 0)) out.push('tires');
  if ((inventory.parts ?? 0) < (cost.parts ?? 0)) out.push('parts');
  return out;
}

// Total Rp value of inventory at current market prices.
export function inventoryValue(inventory, marketPrices) {
  if (!inventory || !marketPrices) return 0;
  return ASSET_LIST.reduce(
    (acc, a) => acc + (inventory[a.id] ?? 0) * (marketPrices[a.id] ?? a.basePrice),
    0
  );
}
