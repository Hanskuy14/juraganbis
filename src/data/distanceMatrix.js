// Approximate road distances (km) between major cities in Java.
// Stored in a flat dictionary using a normalized "a__b" key (alphabetically
// sorted) so getDistance(a, b) === getDistance(b, a) automatically.

const PAIRS = {
  // Jakarta
  jakarta__bandung: 150,
  cirebon__jakarta: 220,
  jakarta__purwokerto: 360,
  jakarta__semarang: 450,
  jakarta__yogyakarta: 560,
  jakarta__solo: 600,
  jakarta__madiun: 660,
  jakarta__surabaya: 780,
  jakarta__malang: 870,
  banyuwangi__jakarta: 1050,

  // Bandung
  bandung__cirebon: 130,
  bandung__purwokerto: 240,
  bandung__semarang: 380,
  bandung__yogyakarta: 420,
  bandung__solo: 480,
  bandung__madiun: 560,
  bandung__surabaya: 700,
  bandung__malang: 790,
  bandung__banyuwangi: 970,

  // Cirebon
  cirebon__purwokerto: 170,
  cirebon__semarang: 240,
  cirebon__yogyakarta: 350,
  cirebon__solo: 380,
  cirebon__madiun: 440,
  cirebon__surabaya: 580,
  cirebon__malang: 670,
  banyuwangi__cirebon: 850,

  // Purwokerto
  purwokerto__semarang: 200,
  purwokerto__yogyakarta: 180,
  purwokerto__solo: 230,
  madiun__purwokerto: 290,
  purwokerto__surabaya: 430,
  malang__purwokerto: 520,
  banyuwangi__purwokerto: 700,

  // Semarang
  semarang__yogyakarta: 130,
  semarang__solo: 100,
  madiun__semarang: 200,
  semarang__surabaya: 350,
  malang__semarang: 440,
  banyuwangi__semarang: 620,

  // Yogyakarta
  solo__yogyakarta: 65,
  madiun__yogyakarta: 170,
  surabaya__yogyakarta: 320,
  malang__yogyakarta: 380,
  banyuwangi__yogyakarta: 590,

  // Solo
  madiun__solo: 110,
  solo__surabaya: 260,
  malang__solo: 320,
  banyuwangi__solo: 530,

  // Madiun
  madiun__surabaya: 170,
  madiun__malang: 220,
  banyuwangi__madiun: 440,

  // Surabaya
  malang__surabaya: 90,
  banyuwangi__surabaya: 290,

  // Malang
  banyuwangi__malang: 320,
};

const key = (a, b) => [a, b].sort().join('__');

export function getDistance(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return 0;
  return PAIRS[key(fromId, toId)] ?? 0;
}

// Returns true if a city pair has a recorded distance > 0.
export function hasDistance(fromId, toId) {
  return getDistance(fromId, toId) > 0;
}
