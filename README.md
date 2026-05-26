# Raja Pantura — Juragan Bus Malam

Tycoon transportasi bus malam Pulau Jawa, dibangun dengan **React + Vite + Tailwind CSS**. Bahasa UI: Indonesia. Bahasa kode: Inggris.

> **Status:** Phase 1 — Core Engine, Fleet, & Dynamic Route Management.

## Fitur Phase 1

- **Modal awal Rp 800.000.000** dengan formatting IDR (`Rp 800.000.000`).
- **Save otomatis** ke `localStorage` (key `rajaPantura.save.v1`) — tutup tab kapan saja, lanjutkan dari menu utama.
- **Dealer Karoseri** dengan 3 kelas bus:
  - Bumel / Ekonomi — 60 kursi, 4 km/L, Rp 400 jt
  - Patas / Executive — 40 kursi, 3 km/L, Rp 900 jt
  - Sleeper Premium — 22 kapsul, 2 km/L, Rp 1,8 M
- **Sistem Trayek Bebas** — pilih bebas terminal asal & tujuan dari 11 kota Jawa
  (Jakarta, Bandung, Cirebon, Purwokerto, Semarang, Yogyakarta, Solo, Madiun,
  Surabaya, Malang, Banyuwangi). Matriks jarak simetris (A→B = B→A).
- **Auto-kalkulasi ekonomi rute**:
  - Jarak diambil dari matriks
  - Biaya BBM = `(jarak / km per liter) × Rp 10.000`
  - Tarif tiket = `tarif/km kelas × jarak × faktor strategi`
  - Strategi: Murah (×0,8 / 90–100% okupansi), Normal (×1,0 / 60–80%), Mahal (×1,5 / 30–50%)
- **Tombol BERANGKAT!** mengeksekusi semua bus yang punya trayek — penumpang
  diacak dalam rentang okupansi strategi, profit/kerugian masuk ke saldo.
- **Laporan Harian** modal dengan rincian pendapatan vs biaya BBM per bus.

## Menjalankan Lokal

```bash
npm install
npm run dev
```

Buka [http://localhost:5173](http://localhost:5173).

## Build Produksi

```bash
npm run build
npm run preview
```

## Deploy ke Netlify

Repo ini sudah berisi `netlify.toml`. Cukup _Connect to Git_ di Netlify, lalu:

- **Build command:** `npm run build`
- **Publish directory:** `dist`

SPA redirect ke `index.html` sudah diatur di config.

## Struktur

```
src/
  components/         # MainMenu, Topbar, Dashboard, Dealer, Garasi, DailyReportModal
  context/GameContext.jsx
  data/               # busTypes, cities, distanceMatrix
  utils/              # format (IDR), economics, storage, id
  App.jsx
  main.jsx
  index.css
```

## Roadmap

- **Phase 2** — Crew Management (sopir, kernet) & Real-time Events.
- **Phase 3** — Maintenance, prestige meter, kompetitor PO.

> Phase 1 sengaja **tidak** menyertakan HR, perawatan, atau random event.
