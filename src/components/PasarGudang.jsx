import { useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import {
  ASSET_LIST,
  inventoryValue,
  lastNPrices,
  priceTrend,
  priceVerdict,
  priceWindow,
  relativeBand,
} from '../utils/market';
import { formatIDR, formatIDRCompact, formatNumber } from '../utils/format';

// "Pasar & Gudang" — the Macro-Economic AI tab. Three commodities, one
// candlestick-ish line chart per asset, buy/sell controls. The market
// ticks AT THE END of each day (right after dispatch) so what you see here
// is *today's* price; tomorrow's prices reveal themselves with the report.

export default function PasarGudang({ onTabChange }) {
  const { state, buyAsset, sellAsset } = useGame();
  const totalValue = inventoryValue(state.inventory, state.marketPrices);

  return (
    <div className="space-y-6">
      <section className="glass-panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            📈 Pasar &amp; Gudang
          </h2>
          <p className="text-sm text-white/60">
            Stok 3 komoditas inti. Harga ngikut pasar bebas — beli pas{' '}
            <span className="text-emerald-300">murah</span>, simpan, pakai pas{' '}
            <span className="text-amber-300">mahal</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Stat
            label="Nilai Gudang"
            value={formatIDRCompact(totalValue)}
            tone="text-emerald-300"
            hint={`Hari ke-${state.day}`}
          />
          <Stat
            label="Saldo Cash"
            value={formatIDRCompact(state.balance)}
            tone={state.balance < 0 ? 'text-rose-300' : 'text-amber-300'}
          />
          <button onClick={() => onTabChange('dashboard')} className="btn-secondary text-xs">
            Dashboard →
          </button>
        </div>
      </section>

      {/* Three asset cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {ASSET_LIST.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            price={state.marketPrices[asset.id]}
            history={state.priceHistory[asset.id]}
            stock={state.inventory[asset.id] ?? 0}
            balance={state.balance}
            onBuy={(qty) => buyAsset(asset.id, qty)}
            onSell={(qty) => sellAsset(asset.id, qty)}
          />
        ))}
      </div>

      {/* How-to */}
      <section className="glass-panel p-5">
        <h3 className="font-display text-sm font-bold text-white">
          💡 Cara baca grafik
        </h3>
        <ul className="mt-2 space-y-1.5 text-xs text-white/65">
          <li>
            <span className="font-semibold text-emerald-300">Garis hijau</span> = harga turun di bawah
            harga pasaran (basis). Saatnya borong stok.
          </li>
          <li>
            <span className="font-semibold text-amber-300">Garis kuning</span> = harga di atas basis
            tapi masih wajar. Beli secukupnya saja.
          </li>
          <li>
            <span className="font-semibold text-rose-300">Garis merah</span> = harga sedang spike
            tinggi. Tahan dulu — bus yang sudah jalan tetap pakai stok lama.
          </li>
          <li>
            Trayek &lt; 300 km cuma butuh <strong>solar</strong>. Trayek 300–500 km butuh{' '}
            <strong>+ 1 ban</strong>. Trayek &gt; 500 km butuh <strong>+ 1 suku cadang</strong>.
          </li>
        </ul>
      </section>
    </div>
  );
}

// ---- Asset card ----------------------------------------------------------

function AssetCard({ asset, price, history, stock, balance, onBuy, onSell }) {
  const series = useMemo(() => lastNPrices(history ?? [], 7), [history]);
  const trend = useMemo(() => priceTrend(history ?? []), [history]);
  const verdict = useMemo(() => priceVerdict(price, asset), [price, asset]);
  const band = useMemo(() => relativeBand(price, asset), [price, asset]);
  const stockValue = price * stock;
  const maxBuyable = Math.floor(balance / Math.max(1, price));

  return (
    <article
      className={`glass-card relative overflow-hidden bg-gradient-to-br ${asset.accent} p-4`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-black/30 text-2xl">
            {asset.icon}
          </div>
          <div className="leading-tight">
            <div className="font-display text-base font-bold text-white">{asset.name}</div>
            <div className="text-[11px] text-white/55">
              Basis: {formatIDR(asset.basePrice)}/{asset.unit}
            </div>
          </div>
        </div>
        <TrendPill trend={trend} />
      </header>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="font-display text-2xl font-extrabold text-white">
          {formatIDR(price)}
        </span>
        <span className={`text-xs font-bold ${verdict.tone}`}>{verdict.label}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-white/55">
        per {asset.unitLabel} · {verdict.advice}
      </p>

      {/* Chart */}
      <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/45">
          <span>7 hari terakhir</span>
          <span>{series.length}/7</span>
        </div>
        <PriceChart series={series} color={asset.chart} basePrice={asset.basePrice} />
        <BandIndicator band={band} />
      </div>

      {/* Inventory readout */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Cell
          label="Stok kamu"
          value={`${formatNumber(stock)} ${asset.unit}`}
          tone="text-white"
        />
        <Cell
          label="Nilai stok"
          value={formatIDRCompact(stockValue)}
          tone="text-emerald-300"
        />
      </div>

      {/* Trade form */}
      <TradeForm
        asset={asset}
        price={price}
        stock={stock}
        balance={balance}
        maxBuyable={maxBuyable}
        onBuy={onBuy}
        onSell={onSell}
      />
    </article>
  );
}

function TrendPill({ trend }) {
  if (trend.direction === 'up') {
    return (
      <span className="pill border-rose-400/40 bg-rose-500/15 text-rose-200">
        ▲ {(trend.ratio * 100).toFixed(1)}%
      </span>
    );
  }
  if (trend.direction === 'down') {
    return (
      <span className="pill border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
        ▼ {Math.abs(trend.ratio * 100).toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="pill border-white/15 bg-white/5 text-white/65">— flat</span>
  );
}

// SVG line chart with a base-price reference line.
function PriceChart({ series, color, basePrice }) {
  const w = 280;
  const h = 80;
  const padX = 6;
  const padY = 8;

  // Build a window that always includes the base price + a 5% buffer so the
  // base reference line is always visible.
  const all = [...series, basePrice];
  const { min, max } = priceWindow(all);
  const range = max - min || 1;

  if (series.length === 0) {
    return <div className="h-20 text-xs text-white/40">Belum ada data...</div>;
  }

  const xStep = (w - 2 * padX) / Math.max(1, series.length - 1);
  const yFor = (v) => padY + ((max - v) / range) * (h - 2 * padY);

  const points = series.map((v, i) => `${padX + i * xStep},${yFor(v)}`);
  const polyline = points.join(' ');

  const baseY = yFor(basePrice);
  const lastV = series[series.length - 1];
  const lastX = padX + (series.length - 1) * xStep;
  const lastY = yFor(lastV);

  // Area under line (gradient fill).
  const areaPath = [
    `M ${padX},${h - padY}`,
    ...series.map((v, i) => `L ${padX + i * xStep},${yFor(v)}`),
    `L ${lastX},${h - padY}`,
    'Z',
  ].join(' ');

  const gradId = `g-${color.replace('#', '')}-${Math.round(basePrice)}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Base price reference line */}
      <line
        x1={padX}
        x2={w - padX}
        y1={baseY}
        y2={baseY}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text
        x={w - padX}
        y={baseY - 2}
        textAnchor="end"
        className="text-[8px]"
        fill="rgba(255,255,255,0.45)"
      >
        basis
      </text>

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradId})`} />

      {/* Line */}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={polyline}
      />

      {/* Dots */}
      {series.map((v, i) => (
        <circle
          key={i}
          cx={padX + i * xStep}
          cy={yFor(v)}
          r={i === series.length - 1 ? 3 : 1.6}
          fill={color}
        />
      ))}

      {/* Latest label */}
      <circle cx={lastX} cy={lastY} r="5" fill={color} fillOpacity="0.25" />
    </svg>
  );
}

// 0..1 band indicator showing where current price sits within its allowed
// min/max. Visual reinforcement for the "buy the dip" signal.
function BandIndicator({ band }) {
  const pct = Math.round(band * 100);
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-white/45">
        <span>min</span>
        <span>basis</span>
        <span>max</span>
      </div>
      <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-gradient-to-r from-emerald-500/25 via-amber-500/25 to-rose-500/30">
        <div
          className="absolute -top-0.5 h-3 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
          style={{ left: `calc(${pct}% - 1px)` }}
        />
      </div>
    </div>
  );
}

// ---- Trade form ----------------------------------------------------------

function TradeForm({ asset, price, stock, balance, maxBuyable, onBuy, onSell }) {
  const [qty, setQty] = useState(asset.id === 'fuel' ? '100' : '1');
  const [mode, setMode] = useState('buy'); // 'buy' | 'sell'

  const parsedQty = Math.max(0, Number.parseInt(qty, 10) || 0);
  const buyTotal = price * parsedQty;
  const sellTotal = Math.round(price * parsedQty * 0.9);

  const canBuy = mode === 'buy' && parsedQty > 0 && balance >= buyTotal;
  const canSell = mode === 'sell' && parsedQty > 0 && stock >= parsedQty;

  // Quick-fill quantity buttons. Different presets per asset (buying 1 liter
  // is silly, but buying 1 tire makes sense).
  const presets = useMemo(() => {
    if (asset.id === 'fuel') return [50, 100, 250, 500];
    return [1, 5, 10];
  }, [asset.id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (parsedQty <= 0) return;
    if (mode === 'buy' && balance >= buyTotal) onBuy(parsedQty);
    else if (mode === 'sell' && stock >= parsedQty) onSell(parsedQty);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => setMode('buy')}
          className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            mode === 'buy'
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
              : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10'
          }`}
        >
          Beli
        </button>
        <button
          type="button"
          onClick={() => setMode('sell')}
          className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            mode === 'sell'
              ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
              : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10'
          }`}
        >
          Jual
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="field-input flex-1 !py-1.5 !text-sm"
          placeholder={`Jumlah (${asset.unit})`}
        />
        <button
          type="submit"
          disabled={mode === 'buy' ? !canBuy : !canSell}
          className={`${mode === 'buy' ? 'btn-primary' : 'btn-danger'} !py-1.5 !text-xs`}
        >
          {mode === 'buy' ? 'Beli' : 'Jual'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setQty(String(p))}
            className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/65 hover:bg-white/10"
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            setQty(String(mode === 'buy' ? maxBuyable : stock))
          }
          className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/65 hover:bg-white/10"
        >
          MAX ({mode === 'buy' ? maxBuyable : stock})
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-white/55">
          {mode === 'buy' ? 'Total bayar' : 'Total terima (90%)'}
        </span>
        <span className={`font-bold ${mode === 'buy' ? 'text-amber-300' : 'text-emerald-300'}`}>
          {formatIDR(mode === 'buy' ? buyTotal : sellTotal)}
        </span>
      </div>
      {mode === 'buy' && parsedQty > 0 && balance < buyTotal && (
        <div className="mt-1 text-[11px] text-rose-300">
          Saldo kurang {formatIDR(buyTotal - balance)}.
        </div>
      )}
      {mode === 'sell' && parsedQty > 0 && stock < parsedQty && (
        <div className="mt-1 text-[11px] text-rose-300">
          Stok cuma {stock} {asset.unit}.
        </div>
      )}
    </form>
  );
}

// ---- Tiny atoms ----------------------------------------------------------

function Stat({ label, value, tone = 'text-white', hint }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className={`font-display text-base font-bold ${tone}`}>{value}</div>
      {hint && <div className="text-[10px] text-white/40">{hint}</div>}
    </div>
  );
}

function Cell({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xs font-bold ${tone}`}>{value}</div>
    </div>
  );
}
