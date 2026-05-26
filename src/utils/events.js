// Random encounter system. The engine rolls at most one event per dispatch.
// Razia requires a player choice, Macet/Viral are acknowledgement-only.

export const EVENT_PROBABILITY = 0.35;

export const RAZIA_BRIBE = 500_000;
export const RAZIA_FINE = 2_000_000;
export const VIRAL_DURATION_DAYS = 3;
export const VIRAL_DEMAND_MULT = 1.4;
export const MACET_FUEL_MULT = 1.5;
export const MACET_SATISFACTION_DROP = 0.15; // shaves occupancy

export const EVENT_DEFS = {
  razia: {
    id: 'razia',
    title: 'Razia Jembatan Timbang',
    icon: '🚧',
    tone: 'rose',
    requiresChoice: true,
    body:
      'Bus armada-mu disetop di Jembatan Timbang. Petugas curiga muatan over-kapasitas. ' +
      'Ada dua opsi cepat: bayar "uang kopi" atau ngotot, dengan risiko tilang resmi.',
    choices: [
      {
        id: 'bribe',
        label: `Sodorin Uang Kopi (Rp ${(RAZIA_BRIBE).toLocaleString('id-ID')})`,
        tone: 'btn-secondary',
        helper: 'Aman. Trip lanjut normal, hanya saldo berkurang.',
      },
      {
        id: 'refuse',
        label: `Tolak — Hadapi Razia Resmi`,
        tone: 'btn-danger',
        helper: `Denda Rp ${(RAZIA_FINE).toLocaleString('id-ID')} + waktu hilang (–20% pendapatan trip).`,
      },
    ],
  },
  macet: {
    id: 'macet',
    title: 'Macet Parah Tol Cikampek',
    icon: '🚦',
    tone: 'amber',
    requiresChoice: false,
    body:
      'Tol Cikampek lumpuh berjam-jam. Solar lebih boros, penumpang misuh-misuh, ' +
      'rating perjalanan turun. Tidak ada yang bisa dilakukan selain menerima.',
    impact: [
      'Biaya BBM trip naik 50%.',
      'Okupansi efektif turun 15% karena kekecewaan penumpang.',
    ],
  },
  viral: {
    id: 'viral',
    title: 'Viral di TikTok!',
    icon: '🎬',
    tone: 'emerald',
    requiresChoice: false,
    body:
      'Bus Mania ngerekam armada premium-mu. Video tembus jutaan views. ' +
      'Permintaan tiket meledak untuk 3 hari ke depan!',
    impact: [
      `Boost demand ×${VIRAL_DEMAND_MULT} selama ${VIRAL_DURATION_DAYS} hari.`,
      'Berlaku untuk seluruh armada yang berangkat.',
    ],
  },
};

// Roll the dispatch-time event. `state.fleet` and `state.drivers` are inspected
// to decide whether Viral can fire (needs at least one Sleeper bus assigned, OR
// at least one driver with skill >= 8 currently on duty). Returns null if no
// bus would actually dispatch — no point rolling road events for an empty road.
export function rollDispatchEvent(state) {
  // Skip if nothing is going out tonight.
  const anyDispatching = (state.fleet ?? []).some(
    (b) =>
      b.assignedRoute &&
      b.assignedDriver &&
      b.status !== 'in_service'
  );
  if (!anyDispatching) return null;

  if (Math.random() > EVENT_PROBABILITY) return null;

  const candidates = [
    { ref: EVENT_DEFS.razia, weight: 4 },
    { ref: EVENT_DEFS.macet, weight: 4 },
  ];

  const driversById = Object.fromEntries(
    (state.drivers ?? []).map((d) => [d.id, d])
  );
  const dispatchableSleeper = state.fleet.some((b) => {
    if (b.class !== 'sleeper') return false;
    if (!b.assignedRoute || !b.assignedDriver) return false;
    if (b.status === 'in_service') return false;
    return true;
  });
  const seniorOnDuty = state.fleet.some((b) => {
    if (!b.assignedRoute || !b.assignedDriver) return false;
    if (b.status === 'in_service') return false;
    const drv = driversById[b.assignedDriver];
    return drv && drv.skill >= 8;
  });

  if (dispatchableSleeper || seniorOnDuty) {
    candidates.push({ ref: EVENT_DEFS.viral, weight: 2 });
  }

  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) {
      // Return a fresh shallow copy so we can attach runtime info (choice).
      return { ...c.ref };
    }
  }
  return null;
}

// Turn an event + a player choice into concrete numeric modifiers used by the
// dispatch resolver. Pure: no state mutation here.
export function resolveEventEffects(event, choice) {
  const mods = {
    fuelMult: 1,
    demandMult: 1,
    immediateBalanceDelta: 0,
    notes: [], // human-readable strings shown at top of daily report
    activateViral: false,
  };
  if (!event) return mods;

  if (event.id === 'razia') {
    if (choice === 'bribe') {
      mods.immediateBalanceDelta -= RAZIA_BRIBE;
      mods.notes.push(`Razia: bayar uang kopi Rp ${RAZIA_BRIBE.toLocaleString('id-ID')}.`);
    } else {
      mods.immediateBalanceDelta -= RAZIA_FINE;
      mods.demandMult *= 0.8;
      mods.notes.push(
        `Razia: kena denda Rp ${RAZIA_FINE.toLocaleString('id-ID')} & telat (-20% pendapatan trip).`
      );
    }
  } else if (event.id === 'macet') {
    mods.fuelMult *= MACET_FUEL_MULT;
    mods.demandMult *= 1 - MACET_SATISFACTION_DROP;
    mods.notes.push('Macet Cikampek: BBM +50%, kepuasan penumpang -15%.');
  } else if (event.id === 'viral') {
    mods.activateViral = true;
    mods.notes.push(`Viral TikTok: demand ×${VIRAL_DEMAND_MULT} aktif ${VIRAL_DURATION_DAYS} hari.`);
  }
  return mods;
}
