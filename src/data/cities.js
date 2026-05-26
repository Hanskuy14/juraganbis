// Cities along the Pantura / Selatan corridor of Java Island.
// Order is from West to East to make UI dropdowns feel intuitive.

export const CITIES = [
  { id: 'jakarta', name: 'Jakarta', region: 'DKI Jakarta' },
  { id: 'bandung', name: 'Bandung', region: 'Jawa Barat' },
  { id: 'cirebon', name: 'Cirebon', region: 'Jawa Barat' },
  { id: 'purwokerto', name: 'Purwokerto', region: 'Jawa Tengah' },
  { id: 'semarang', name: 'Semarang', region: 'Jawa Tengah' },
  { id: 'yogyakarta', name: 'Yogyakarta', region: 'DI Yogyakarta' },
  { id: 'solo', name: 'Solo', region: 'Jawa Tengah' },
  { id: 'madiun', name: 'Madiun', region: 'Jawa Timur' },
  { id: 'surabaya', name: 'Surabaya', region: 'Jawa Timur' },
  { id: 'malang', name: 'Malang', region: 'Jawa Timur' },
  { id: 'banyuwangi', name: 'Banyuwangi', region: 'Jawa Timur' },
];

export const getCity = (id) => CITIES.find((c) => c.id === id);
