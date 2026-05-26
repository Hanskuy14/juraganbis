// Personnel catalog: driver / kernet name pools + procedural generators.
// We keep the name pool short and recognizable so the game world feels rooted
// in Indonesian bus culture (Pak ___ for senior drivers, Mas ___ for kernet).

const DRIVER_FIRST_NAMES = [
  'Slamet', 'Budi', 'Joko', 'Hartono', 'Sukardi', 'Wahid', 'Subandi',
  'Iskandar', 'Sumarno', 'Sudirman', 'Sutopo', 'Maman', 'Wagiman',
  'Tono', 'Karjo', 'Marno', 'Pardi', 'Yatno', 'Mulyadi', 'Suparman',
  'Kusno', 'Bejo', 'Ngadimin', 'Suroso', 'Tarmin',
];

const KERNET_FIRST_NAMES = [
  'Andi', 'Joni', 'Riko', 'Bagus', 'Yanto', 'Roni', 'Dedi',
  'Agus', 'Bambang', 'Eko', 'Hadi', 'Iman', 'Rian', 'Doni',
  'Hendra', 'Toni', 'Arif', 'Gilang', 'Fajar', 'Reza',
];

const NICKNAMES = [
  'Si Rajawali', 'Si Petir', 'Si Macan', 'Si Kanjeng', 'Si Pantura',
  'Si Joss', 'Si Gledek', 'Si Garuda', 'Si Maut', 'Si Singo',
  'Si Tornado', 'Si Sultan', 'Si Tatto', 'Si Komando', 'Si Bledek',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Skill distribution skewed toward mid-range: most drivers are 3-7, rarely 9-10.
function rollSkill() {
  const r = Math.random() * Math.random(); // 0..1, biased low
  return Math.max(1, Math.min(10, Math.round(2 + r * 9)));
}

// Salary curve: cheap rookies (~Rp 500k) up to elite veterans (~Rp 2,3 jt) per trip.
// Adds a small jitter so two skill-7 drivers don't have identical pay.
function rollSalary(skill) {
  const base = 300_000 + skill * 200_000;
  const jitter = Math.round((Math.random() * 0.2 - 0.1) * base);
  // Round to nearest Rp 50.000 for tidy UI.
  return Math.round((base + jitter) / 50_000) * 50_000;
}

export function generateDriverCandidate() {
  const skill = rollSkill();
  return {
    candidateId: `cand_drv_${Math.random().toString(16).slice(2, 8)}`,
    firstName: pick(DRIVER_FIRST_NAMES),
    nickname: Math.random() < 0.4 ? pick(NICKNAMES) : null,
    skill,
    salary: rollSalary(skill),
  };
}

export function generateKernetCandidate() {
  // Kernet has no skill stat — just charisma (illegal-passenger bonus).
  // We bake that into a small per-trip salary range.
  const charisma = Math.max(1, Math.min(10, Math.round(3 + Math.random() * 6)));
  const baseSalary = 100_000 + charisma * 25_000;
  const salary = Math.round(baseSalary / 25_000) * 25_000;
  return {
    candidateId: `cand_krn_${Math.random().toString(16).slice(2, 8)}`,
    firstName: pick(KERNET_FIRST_NAMES),
    charisma,
    salary,
  };
}

// Hire conversions (candidate object → permanent staff record).
export function driverFromCandidate(cand) {
  return {
    id: `drv_${Math.random().toString(16).slice(2, 10)}`,
    name: `Pak ${cand.firstName}${cand.nickname ? ` "${cand.nickname}"` : ''}`,
    skill: cand.skill,
    salary: cand.salary,
    stamina: 100,
    assignedBus: null,
    tripsCompleted: 0,
    crashed: false, // future-proof flag for later phases
  };
}

export function kernetFromCandidate(cand) {
  return {
    id: `krn_${Math.random().toString(16).slice(2, 10)}`,
    name: `Mas ${cand.firstName}`,
    charisma: cand.charisma,
    salary: cand.salary,
    assignedBus: null,
  };
}

export const HR_POOL_SIZE = { drivers: 5, kernets: 4 };

export function generateHRPool() {
  return {
    drivers: Array.from({ length: HR_POOL_SIZE.drivers }, generateDriverCandidate),
    kernets: Array.from({ length: HR_POOL_SIZE.kernets }, generateKernetCandidate),
  };
}

// Driver skill tiers — surface friendly labels in UI without exposing raw 1-10.
export function skillTier(skill) {
  if (skill >= 9) return { label: 'Veteran', tone: 'text-amber-300 border-amber-400/40 bg-amber-500/10' };
  if (skill >= 7) return { label: 'Senior', tone: 'text-sky-300 border-sky-400/40 bg-sky-500/10' };
  if (skill >= 4) return { label: 'Madya', tone: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' };
  return { label: 'Pemula', tone: 'text-white/70 border-white/20 bg-white/5' };
}

// Stamina state buckets — used to decide whether a driver can dispatch and to
// color the badge in HR / Garasi.
export const STAMINA_TIRED_THRESHOLD = 20;
export const STAMINA_REGEN_PER_DAY = 35;

export function staminaTier(stamina) {
  if (stamina >= 70) return { label: 'Bugar', tone: 'text-emerald-300' };
  if (stamina >= 40) return { label: 'Lelah', tone: 'text-amber-300' };
  if (stamina >= STAMINA_TIRED_THRESHOLD) return { label: 'Loyo', tone: 'text-orange-300' };
  return { label: 'Drop', tone: 'text-rose-300' };
}
