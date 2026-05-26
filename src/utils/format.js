// IDR formatting helpers. Indonesian locale uses "." as thousand separator
// and "," as decimal separator. We always render whole rupiah, no decimals.

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const num = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export const formatIDR = (value) => idr.format(Math.round(Number(value) || 0));
export const formatNumber = (value) => num.format(Math.round(Number(value) || 0));

// Compact rupiah for cramped UI: Rp 1,5 M / Rp 750 Jt etc.
export function formatIDRCompact(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${Math.round(abs / 1_000_000)} Jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${Math.round(abs / 1_000)} Rb`;
  }
  return formatIDR(n);
}

export const formatPercent = (ratio) =>
  `${Math.round((Number(ratio) || 0) * 100)}%`;
