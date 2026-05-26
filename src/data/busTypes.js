// Catalog of bus classes available at the Dealer Karoseri.
// fuelEfficiency is in km / liter. pricePerKm is the BASE ticket price per km
// applied to a single seat at "Normal" margin (1.0x). Diesel is fixed at
// Rp 10.000 per liter (handled in utils/economics.js).

export const BUS_TYPES = [
  {
    id: 'bumel',
    name: 'Bumel / Ekonomi',
    tagline: 'Tarik penumpang massal, untung tipis tapi konsisten.',
    class: 'Ekonomi',
    price: 400_000_000,
    capacity: 60,
    fuelEfficiency: 4, // km / liter
    pricePerKm: 300, // Rp per km per seat (base, Normal margin)
    comfort: 1,
    prestige: 1,
    accent: 'from-emerald-500/20 to-emerald-500/5',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
    icon: '🚌',
  },
  {
    id: 'patas',
    name: 'Patas / Executive',
    tagline: 'AC dingin, 40 kursi reclining. Andalan trayek menengah.',
    class: 'Executive',
    price: 900_000_000,
    capacity: 40,
    fuelEfficiency: 3,
    pricePerKm: 600,
    comfort: 3,
    prestige: 3,
    accent: 'from-sky-500/20 to-sky-500/5',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-400/30',
    icon: '🚍',
  },
  {
    id: 'sleeper',
    name: 'Sleeper Premium',
    tagline: '22 capsule bed. Prestise tertinggi, biaya bahan bakar boros.',
    class: 'Sleeper',
    price: 1_800_000_000,
    capacity: 22,
    fuelEfficiency: 2,
    pricePerKm: 1000,
    comfort: 5,
    prestige: 5,
    accent: 'from-amber-500/25 to-amber-500/5',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
    icon: '🛌',
  },
];

export const getBusType = (id) => BUS_TYPES.find((b) => b.id === id);

// Pricing strategies (margin factors). Occupancy is randomized per dispatch
// inside the band [min, max] so two identical trips don't always net the same.
export const PRICING_STRATEGIES = {
  cheap: {
    id: 'cheap',
    label: 'Murah',
    factor: 0.8,
    occupancy: [0.9, 1.0],
    description: 'Tiket murah, kursi hampir penuh. Margin sangat tipis.',
    tone: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    factor: 1.0,
    occupancy: [0.6, 0.8],
    description: 'Harga pasaran. Okupansi seimbang dengan margin sehat.',
    tone: 'text-sky-300 border-sky-400/40 bg-sky-500/10',
  },
  premium: {
    id: 'premium',
    label: 'Mahal',
    factor: 1.5,
    occupancy: [0.3, 0.5],
    description: 'Tarif premium. Risiko bus sepi, tapi cuan per kursi besar.',
    tone: 'text-amber-300 border-amber-400/40 bg-amber-500/10',
  },
};
