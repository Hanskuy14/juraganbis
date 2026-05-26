// AI rival PO operators that compete with the player for the #1 spot
// on the Persaingan PO leaderboard. Each one has a base reputation and
// fleet size, plus a deterministic-ish growth profile so the leaderboard
// keeps moving in the background.

export const AI_RIVALS = [
  {
    id: 'hariyanto',
    name: 'PO Hariyanto',
    blurb: 'Andalan rute Jogja-Surabaya. Sleeper minimalis, fanbase fanatik.',
    baseReputation: 360,
    baseFleet: 8,
    growthMin: 2,
    growthMax: 5,
    fleetGrowDays: 8,
  },
  {
    id: 'rosalia',
    name: 'PO Rosalia Indah',
    blurb: 'Raja trayek Solo-Jakarta. Armada besar, tarif premium.',
    baseReputation: 460,
    baseFleet: 14,
    growthMin: 3,
    growthMax: 6,
    fleetGrowDays: 7,
  },
  {
    id: 'sumber-kencono',
    name: 'PO Sumber Kencono',
    blurb: 'Legendaris di trayek Surabaya-Jogja. Cepat tapi sering disorot.',
    baseReputation: 280,
    baseFleet: 6,
    growthMin: 2,
    growthMax: 4,
    fleetGrowDays: 10,
  },
  {
    id: 'pahala',
    name: 'PO Pahala Kencana',
    blurb: 'Pemain lama. Armada Patas masih banyak diminati keluarga.',
    baseReputation: 400,
    baseFleet: 11,
    growthMin: 2,
    growthMax: 5,
    fleetGrowDays: 8,
  },
  {
    id: 'lorena',
    name: 'PO Lorena',
    blurb: 'Spesialis trayek panjang Jakarta-Banyuwangi.',
    baseReputation: 320,
    baseFleet: 7,
    growthMin: 1,
    growthMax: 4,
    fleetGrowDays: 9,
  },
];

export function initialRivalsState() {
  return AI_RIVALS.map((r) => ({
    id: r.id,
    name: r.name,
    blurb: r.blurb,
    reputation: r.baseReputation,
    fleet: r.baseFleet,
    growthMin: r.growthMin,
    growthMax: r.growthMax,
    fleetGrowDays: r.fleetGrowDays,
  }));
}

// Advance every rival one day. Reputation grows by a small random amount
// (capped at 1000), fleet grows on a fixed cadence per rival.
export function tickRivals(rivals, day) {
  return rivals.map((r) => {
    const span = Math.max(0, r.growthMax - r.growthMin);
    const grow = r.growthMin + Math.floor(Math.random() * (span + 1));
    const reputation = Math.min(1000, r.reputation + grow);
    let fleet = r.fleet;
    if (day > 0 && day % r.fleetGrowDays === 0) {
      fleet = r.fleet + 1;
    }
    return { ...r, reputation, fleet };
  });
}

// Combined ranking of player + AI rivals. We sort by a single compound score
// (reputation + fleet*25) so big fleets matter but reputation dominates.
export function computeRanking(playerEntry, rivals) {
  const score = (e) => e.reputation + e.fleet * 25;
  const all = [
    { ...playerEntry, isPlayer: true },
    ...rivals.map((r) => ({
      id: r.id,
      name: r.name,
      reputation: r.reputation,
      fleet: r.fleet,
      blurb: r.blurb,
      isPlayer: false,
    })),
  ];
  all.sort((a, b) => score(b) - score(a));
  return all.map((entry, idx) => ({ ...entry, rank: idx + 1, score: score(entry) }));
}
