// Staff catalog: drivers (Supir) and co-drivers (Kernet).
// Names and stats are generated at hire time inside the HR component;
// this module owns the pools, ranges, and salary math so the rules are in
// one place.

const FIRST_NAMES = [
  'Sukarno', 'Joko', 'Bambang', 'Agus', 'Budi', 'Slamet', 'Tarjo', 'Marno',
  'Suparman', 'Hartono', 'Suryadi', 'Cahyono', 'Wahyudi', 'Riyanto',
  'Mulyadi', 'Hendro', 'Darto', 'Yanto', 'Widodo', 'Kusno', 'Sutarno',
  'Pardi', 'Karso', 'Rusdi', 'Heri', 'Gimin',
];

const LAST_NAMES = [
  'Sutopo', 'Saputra', 'Wibowo', 'Pranoto', 'Hidayat', 'Setiawan',
  'Susanto', 'Iskandar', 'Permana', 'Nugroho', 'Kurniawan', 'Pratama',
  'Wijaya', 'Santoso', 'Hartanto', 'Pamungkas', 'Anggoro', 'Sasongko',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

// --- Driver (Supir) ---------------------------------------------------------

// Skill drives:
//   - travel safety (lower bus condition damage)
//   - viral chance (a "Tiktok" event needs skill >= 8 OR a sleeper bus)
//   - per-trip salary (high-skill drivers cost more)
//
// Stamina starts full and decays per trip based on route length. We only
// stop a driver from going out when stamina < 20 OR they're already running
// (1 trip per day in the current model).
export const DRIVER_HIRE_COST = 2_000_000;     // sign-on bonus
export const KERNET_HIRE_COST = 500_000;       // smaller upfront

export const STAMINA_MAX = 100;
export const STAMINA_REST_REGEN = 35;          // per "day off" tick
export const STAMINA_FLOOR_TO_DRIVE = 20;      // below this, refuses trip

// Per-trip salary scaling. A skill-3 driver runs ~Rp 150k/trip; skill-9 driver
// runs ~Rp 600k/trip. Tuned so a Bumel still nets profit on cheap routes.
export function driverTripSalary(skill) {
  return 100_000 + skill * 50_000;
}

// Kernet flat per-trip wage. They also bring back "penumpang gelap" cash but
// overload the bus a bit (extra condition wear).
export const KERNET_TRIP_SALARY = 75_000;
export const KERNET_PENUMPANG_GELAP_BONUS = 250_000; // bonus revenue per trip
export const KERNET_OVERLOAD_WEAR = 1.15;            // condition damage x1.15

// Generate a fresh driver candidate. Skill is biased so most candidates are
// mid-tier, occasional aces.
export function rollDriverCandidate() {
  // skill: weighted 3..9
  const roll = Math.random();
  let skill;
  if (roll < 0.15) skill = 3;
  else if (roll < 0.40) skill = 4;
  else if (roll < 0.65) skill = 5;
  else if (roll < 0.85) skill = 7;
  else if (roll < 0.95) skill = 8;
  else skill = 9;

  return {
    name: randomName(),
    skill,
    stamina: STAMINA_MAX,
    salary: driverTripSalary(skill), // shown to user; recomputed at trip-time
  };
}

export function rollKernetCandidate() {
  return {
    name: randomName(),
    salary: KERNET_TRIP_SALARY,
  };
}

// Stamina drain depends on distance. ~30 for short hops, capped at 50 for
// >700 km. Skill helps a tiny bit.
export function staminaDrainForTrip(distanceKm, skill = 5) {
  const base = 30 + Math.min(20, Math.round((distanceKm / 700) * 20));
  const skillRelief = (skill - 5) * 0.5; // -2 to +2
  return Math.max(20, Math.round(base - skillRelief));
}

// Damage reduction multiplier from driver skill (1.0 = no help, lower = better).
// skill 1 -> 1.10x damage, skill 5 -> 1.0x, skill 10 -> 0.7x.
export function skillConditionMultiplier(skill = 5) {
  return Math.max(0.6, 1.15 - skill * 0.06);
}
