// Permanent asset / facility upgrades. Bought once at the "Aset" tab,
// give passive bonuses for the rest of the game.
//
// Garasi Pusat: hard cap on fleet size. Player must upgrade to buy more buses.
// Kontrak Rest Area: per-passenger commission that lands on each dispatch.
// Fasilitas Montir Internal: flat repair-cost discount in Bengkel + on
//   breakdown fines in the field.

export const REST_AREA_PER_PASSENGER = 5_000;        // Rp / penumpang / dispatch
export const INTERNAL_MECHANIC_DISCOUNT = 0.30;       // 30% diskon servis

// --- Garasi Pusat ----------------------------------------------------------

export const GARAGE_LEVELS = [
  { level: 1, capacity: 3,  upgradeCost: 0 },
  { level: 2, capacity: 6,  upgradeCost: 500_000_000 },
  { level: 3, capacity: 10, upgradeCost: 1_200_000_000 },
  { level: 4, capacity: 15, upgradeCost: 2_500_000_000 },
];

export const MAX_GARAGE_LEVEL = GARAGE_LEVELS[GARAGE_LEVELS.length - 1].level;

export function getGarageLevel(level) {
  return GARAGE_LEVELS.find((g) => g.level === level) ?? GARAGE_LEVELS[0];
}

export function nextGarageLevel(level) {
  return GARAGE_LEVELS.find((g) => g.level === level + 1) ?? null;
}

export function garageCapacity(level) {
  return getGarageLevel(level).capacity;
}

// --- One-shot facility purchases ------------------------------------------

export const REST_AREA_CONTRACT = {
  id: 'restArea',
  name: 'Kontrak Rest Area',
  cost: 250_000_000,
  icon: '🍱',
  tagline: 'Komisi makan penumpang dari rumah makan rest area Pantura.',
  description:
    'Tanda-tangan kerjasama eksklusif dengan jaringan rumah makan di rest area Tol Cipali, ' +
    'Tegal, dan Ngawi. Setiap penumpang yang singgah memberi komisi otomatis ke PO.',
  benefit: `+ Rp ${REST_AREA_PER_PASSENGER.toLocaleString('id-ID')} per penumpang setiap berangkat.`,
};

export const INTERNAL_MECHANIC = {
  id: 'internalMechanic',
  name: 'Fasilitas Montir Internal',
  cost: 400_000_000,
  icon: '🔧',
  tagline: 'Tim montir tetap di pool. Servis tak lagi outsourcing ke bengkel pinggir jalan.',
  description:
    'Bangun fasilitas servis sendiri dengan dua mekanik tetap dan stok suku cadang. ' +
    'Semua biaya perbaikan turun signifikan, baik servis terjadwal maupun perbaikan saat mogok.',
  benefit: `Diskon ${Math.round(INTERNAL_MECHANIC_DISCOUNT * 100)}% biaya servis & denda mogok.`,
};

// Apply the internal-mechanic discount to a repair-related cost.
export function discountedRepairCost(cost, hasInternalMechanic) {
  if (!hasInternalMechanic) return cost;
  return Math.round(cost * (1 - INTERNAL_MECHANIC_DISCOUNT));
}
