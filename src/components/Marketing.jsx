import { useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { getBusType, PRICING_STRATEGIES } from '../data/busTypes';
import {
  AD_SPEND_PRESETS,
  BASE_RATING_DEFAULT,
  MAX_DAILY_AD_SPEND,
  TIER_LABELS,
  averageStars,
  computeVisibility,
  getRouteBudget,
  isShadowbanned,
  shadowbanDaysLeft,
  starsString,
  visibilityToOccupancy,
} from '../utils/marketing';
import { formatIDR, formatIDRCompact, formatPercent } from '../utils/format';

// E-Ticketing & Ads dashboard.
// Lets the player tune marketing budgets per active route, see the projected
// Visibility Score (mirrors what dispatch will lock onto each bus tonight),
// and read the rolling reviews log that drives the shadowban algorithm.
export default function Marketing({ onTabChange }) {
  const { state, routesById } = useGame();
  const marketing = state.marketing ?? {
    baseRating: BASE_RATING_DEFAULT,
    shadowbanUntilDay: 0,
    routeBudgets: {},
    reviews: [],
  };
  const tiktokBoostActive = (state.tiktokBoostDaysLeft ?? 0) > 0;
  const banned = isShadowbanned(marketing, state.day);

  // Map: routeId -> [bus, busType, route] of buses currently assigned there.
  const routeUsage = useMemo(() => {
    const out = {};
    for (const bus of state.fleet) {
      if (!bus.assignedRoute) continue;
      const route = routesById[bus.assignedRoute];
      if (!route) continue;
      const busType = getBusType(bus.class);
      out[route.id] = out[route.id] ?? { route, buses: [] };
      out[route.id].buses.push({ bus, busType });
    }
    return out;
  }, [state.fleet, routesById]);

  // Flatten + sort: routes that have buses come first, then unused.
  const activeRoutes = Object.values(routeUsage);
  const unusedRoutes = state.routes
    .filter((r) => !routeUsage[r.id])
    .map((route) => ({ route, buses: [] }));

  const allRoutes = [...activeRoutes, ...unusedRoutes];

  // Aggregate today's marketing spend (SUM across all dispatched buses).
  const projectedSpend = useMemo(() => {
    let sum = 0;
    for (const { route, buses } of activeRoutes) {
      const budget = getRouteBudget(marketing, route.id);
      sum += budget * buses.length;
    }
    return sum;
  }, [activeRoutes, marketing]);

  return (
    <div className="space-y-6">
      <header className="glass-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="pill border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300">
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
              E-Ticketing &amp; Ads · OTA Visibility Engine
            </span>
            <h2 className="mt-2 font-display text-2xl font-extrabold text-white">
              Beli Visibility, Bukan Iklan TV.
            </h2>
            <p className="mt-1 text-sm text-white/60">
              Algoritma OTA (Traveloka / RedBus) menentukan posisi listing bus-mu.
              Atur budget iklan per trayek — semakin tinggi bid, semakin atas posisi
              listing, semakin penuh bus.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <RatingStat
              label="PO Rating"
              value={`${Math.round(marketing.baseRating ?? BASE_RATING_DEFAULT)}/100`}
              tone={(marketing.baseRating ?? 0) >= 70 ? 'emerald' : 'amber'}
            />
            <RatingStat
              label="Bintang"
              value={
                marketing.reviews?.length
                  ? `${averageStars(marketing.reviews).toFixed(1)} ★`
                  : '—'
              }
              tone="amber"
            />
            <RatingStat
              label="Status Algoritma"
              value={banned ? `🚫 Shadowban ${shadowbanDaysLeft(marketing, state.day)}h` : 'Aktif'}
              tone={banned ? 'rose' : 'sky'}
            />
          </div>
        </div>

        {tiktokBoostActive && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/5 px-3 py-2 text-xs text-fuchsia-100">
            <span className="text-base">🎬</span>
            <span>
              <span className="font-semibold">Boost TikTok aktif</span> — visibility +12 selama {state.tiktokBoostDaysLeft} hari ke depan.
            </span>
          </div>
        )}
        {banned && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            <span className="text-base">⚠</span>
            <span>
              <span className="font-semibold">Shadowban aktif!</span> Visibility -25 sampai akhir hari ke-{marketing.shadowbanUntilDay}. Hindari rating buruk lagi.
            </span>
          </div>
        )}
      </header>

      {/* Today's spend summary */}
      <section className="glass-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold text-white">
              💸 Total Marketing Spend Malam Ini
            </h3>
            <p className="text-[11px] text-white/55">
              Dibebankan saat dispatch — per trayek × jumlah bus aktif di trayek itu.
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-xl font-extrabold text-fuchsia-300">
              {formatIDR(projectedSpend)}
            </div>
            <div className="text-[11px] text-white/45">
              dari {activeRoutes.length} trayek aktif
            </div>
          </div>
        </div>
      </section>

      {/* Per-route bidding */}
      {allRoutes.length === 0 ? (
        <EmptyRoutesCTA onGoGarasi={() => onTabChange('garasi')} />
      ) : (
        <section>
          <h3 className="mb-2 font-display text-lg font-bold text-white">
            🎯 Bidding per Trayek
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {allRoutes.map(({ route, buses }) => (
              <RouteBiddingCard
                key={route.id}
                route={route}
                buses={buses}
                marketing={marketing}
                tiktokBoostActive={tiktokBoostActive}
                banned={banned}
                day={state.day}
              />
            ))}
          </div>
        </section>
      )}

      {/* Reviews feed */}
      <ReviewsFeed reviews={marketing.reviews ?? []} />

      {/* Algorithm explainer */}
      <AlgorithmExplainer />
    </div>
  );
}

// ---- Per-route bidding card ---------------------------------------------

function RouteBiddingCard({ route, buses, marketing, tiktokBoostActive, banned, day }) {
  const { setRouteBudget } = useGame();
  const budget = getRouteBudget(marketing, route.id);
  const strategy = PRICING_STRATEGIES[route.strategy] ?? PRICING_STRATEGIES.normal;

  // Project the visibility for THIS route: same formula the dispatcher will
  // use tonight, just without the random occupancy jitter.
  const projection = useMemo(() => {
    const v = computeVisibility({
      baseRating: marketing.baseRating ?? BASE_RATING_DEFAULT,
      budget,
      strategyId: route.strategy,
      shadowbanned: banned,
      tiktokBoostActive,
    });
    const occ = visibilityToOccupancy(v.score, () => 0.5); // deterministic preview
    return { ...v, ...occ };
  }, [marketing.baseRating, budget, route.strategy, banned, tiktokBoostActive]);

  const tier = TIER_LABELS[projection.tier] ?? TIER_LABELS.mid;
  const totalBudget = budget * (buses.length || 1);
  const breakdown = projection.breakdown;

  return (
    <article className="glass-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-display text-base font-bold text-white">
            <span>{route.fromName}</span>
            <span className="text-amber-400">→</span>
            <span>{route.toName}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/55">
            <span>{route.distanceKm} km</span>
            <span className={`pill ${strategy.tone}`}>Tarif {strategy.label}</span>
            {buses.length > 0 ? (
              <span className="pill border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                {buses.length} bus aktif
              </span>
            ) : (
              <span className="pill border-white/10 bg-white/5 text-white/55">
                Tidak ada bus
              </span>
            )}
          </div>
        </div>
        <div className={`text-right ${tier.tone}`}>
          <div className="text-[10px] uppercase tracking-wider opacity-70">Visibility</div>
          <div className="font-display text-2xl font-extrabold leading-none">
            {projection.score}
            <span className="text-sm opacity-60">/100</span>
          </div>
          <div className="text-[11px] font-semibold">
            {tier.emoji} {tier.label}
          </div>
        </div>
      </header>

      {/* Visibility breakdown bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full transition-[width] duration-200 ease-out ${
            projection.score >= 85
              ? 'bg-emerald-400'
              : projection.score >= 55
              ? 'bg-amber-400'
              : 'bg-rose-400'
          }`}
          style={{ width: `${projection.score}%` }}
        />
      </div>

      {/* Formula transparency */}
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-5">
        <FormulaCell label="Base Rating" value={`+${breakdown.baseRating}`} tone="text-white" />
        <FormulaCell
          label="Ad Spend"
          value={breakdown.adSpend ? `+${breakdown.adSpend}` : '0'}
          tone={breakdown.adSpend > 0 ? 'text-emerald-300' : 'text-white/55'}
        />
        <FormulaCell
          label="Price Penalty"
          value={breakdown.pricePenalty ? `${breakdown.pricePenalty > 0 ? '−' : '+'}${Math.abs(breakdown.pricePenalty)}` : '0'}
          tone={breakdown.pricePenalty > 0 ? 'text-rose-300' : breakdown.pricePenalty < 0 ? 'text-emerald-300' : 'text-white/55'}
        />
        <FormulaCell
          label="Shadowban"
          value={breakdown.shadowban ? `−${breakdown.shadowban}` : '0'}
          tone={breakdown.shadowban ? 'text-rose-300' : 'text-white/55'}
        />
        <FormulaCell
          label="TikTok"
          value={breakdown.tiktok ? `+${breakdown.tiktok}` : '0'}
          tone={breakdown.tiktok ? 'text-fuchsia-300' : 'text-white/55'}
        />
      </div>

      {/* Budget slider + presets */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
            Marketing Budget / hari
          </span>
          <span className="font-display text-sm font-bold text-fuchsia-300">
            {formatIDR(budget)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={MAX_DAILY_AD_SPEND}
          step={10_000}
          value={budget}
          onChange={(e) => setRouteBudget(route.id, Number(e.target.value))}
          className="w-full accent-fuchsia-400"
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {AD_SPEND_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setRouteBudget(route.id, preset)}
              className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                budget === preset
                  ? 'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200'
                  : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]'
              }`}
            >
              {preset === 0 ? 'Off' : formatIDRCompact(preset)}
            </button>
          ))}
        </div>
      </div>

      {/* Projected outcome */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Projection
          label="Okupansi est."
          value={formatPercent(projection.occupancy)}
          tone={tier.tone}
        />
        <Projection
          label="Bus aktif"
          value={`${buses.length}`}
          hint={buses.length > 0 ? 'di trayek ini' : 'belum ada'}
        />
        <Projection
          label="Spend tonight"
          value={formatIDRCompact(totalBudget)}
          hint={`${buses.length}× ${formatIDRCompact(budget)}`}
          tone="text-fuchsia-300"
        />
      </div>

      {/* Bus list */}
      {buses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {buses.map(({ bus, busType }) => (
            <span
              key={bus.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-white/75"
            >
              <span>{busType?.icon ?? '🚌'}</span>
              {bus.name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

// ---- Reviews feed --------------------------------------------------------

function ReviewsFeed({ reviews }) {
  if (!reviews || reviews.length === 0) {
    return (
      <section className="glass-panel p-5">
        <h3 className="font-display text-lg font-bold text-white">⭐ Review Penumpang</h3>
        <p className="mt-1 text-sm text-white/55">
          Belum ada review masuk. Berangkatkan armada dulu, malam ini.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-2 font-display text-lg font-bold text-white">
        ⭐ Review Penumpang
      </h3>
      <p className="mb-3 text-[12px] text-white/55">
        Algoritma OTA ruthless: 1-bintang langsung shadowban 3 hari. Minimalisir mogok dan
        kecelakaan kalau mau tetap muncul di Page 1.
      </p>
      <div className="grid gap-2 lg:grid-cols-2">
        {reviews.slice(0, 12).map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>
    </section>
  );
}

function ReviewCard({ review }) {
  const tone =
    review.stars <= 1
      ? 'border-rose-400/40 bg-rose-500/10'
      : review.stars <= 2
      ? 'border-amber-400/30 bg-amber-500/5'
      : review.stars >= 5
      ? 'border-emerald-400/30 bg-emerald-500/5'
      : 'border-white/10 bg-black/25';
  const starColor =
    review.stars <= 1
      ? 'text-rose-300'
      : review.stars <= 2
      ? 'text-amber-300'
      : review.stars >= 5
      ? 'text-emerald-300'
      : 'text-amber-200';
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
      <div className="flex items-center justify-between">
        <span className={`font-mono text-base ${starColor}`}>{starsString(review.stars)}</span>
        <span className="text-[10px] text-white/45">Hari ke-{review.day}</span>
      </div>
      <div className="mt-0.5 text-xs font-semibold text-white">
        {review.busName}
        <span className="ml-1 text-white/45">· {review.routeLabel}</span>
      </div>
      <div className="mt-1 text-[12px] text-white/75">{review.comment}</div>
    </div>
  );
}

// ---- Helpers / atoms -----------------------------------------------------

function RatingStat({ label, value, tone = 'sky' }) {
  const tones = {
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    amber: 'text-amber-300',
    sky: 'text-sky-300',
  };
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
        {label}
      </div>
      <div className={`text-sm font-bold lg:text-base ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function FormulaCell({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/30 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-[11px] font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function Projection({ label, value, hint, tone = 'text-white' }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
      {hint && <div className="text-[10px] text-white/45">{hint}</div>}
    </div>
  );
}

function EmptyRoutesCTA({ onGoGarasi }) {
  return (
    <div className="glass-panel flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="text-5xl">📭</div>
      <h4 className="font-display text-lg font-bold text-white">
        Belum ada trayek
      </h4>
      <p className="max-w-sm text-sm text-white/60">
        Pasang trayek minimal di satu bus, baru kamu bisa pasang iklan di OTA.
      </p>
      <button onClick={onGoGarasi} className="btn-primary mt-2">
        Buka Garasi →
      </button>
    </div>
  );
}

function AlgorithmExplainer() {
  return (
    <section className="glass-panel p-5">
      <h3 className="font-display text-sm font-bold text-white">📐 Cara kerja algoritma</h3>
      <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-white/70">
        Visibility = Base Rating + Ad Spend Weight − Price Penalty − Shadowban + TikTok
      </div>
      <ul className="mt-3 space-y-1 text-[12px] text-white/60">
        <li>
          <span className="text-emerald-300">Visibility &gt; 85</span> · Top Page 1 ·
          okupansi 95-100% (ledakan tiket).
        </li>
        <li>
          <span className="text-amber-300">Visibility 40-55</span> · terdorong ke Page 2 ·
          okupansi 30-50%.
        </li>
        <li>
          <span className="text-rose-300">Visibility &lt; 40</span> ·
          <span className="font-semibold"> Ghost Bus</span> · okupansi 10-20%, BBM tetap
          terbakar.
        </li>
        <li>
          <span className="text-rose-300">1 Star Review</span> · shadowban 3 hari (-25
          visibility).
        </li>
      </ul>
    </section>
  );
}
