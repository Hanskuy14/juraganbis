# Raja Pantura — Juragan Bus Malam

Tycoon transportasi bus malam Pulau Jawa, dibangun dengan **React + Vite + Tailwind CSS**. Bahasa UI: Indonesia. Bahasa kode: Inggris.

> **Status:** Phase 2 — Crew Management, Maintenance, & Dynamic Events.

## Fitur Phase 1 + 2

### Phase 1 (engine inti)
- Modal awal **Rp 800.000.000**, save otomatis di `localStorage`.
- 3 kelas bus di Dealer Karoseri (Bumel, Patas, Sleeper Premium).
- **Sistem Trayek Bebas** dari 11 kota Jawa, matriks jarak simetris.
- Strategi tiket Murah/Normal/Mahal dengan rentang okupansi.
- Tombol **BERANGKAT!** + Daily Financial Report.

### Phase 2 (kedalaman simulasi)
- **HR / Kantor Pusat** — rekrut **Supir** (skill 1-10, stamina 0-100, gaji per trip) dan **Kernet** (charisma, bonus penumpang gelap). Bursa lowongan auto-rotate setiap hari.
- **Bus tidak bisa berangkat tanpa supir.** Supir dengan stamina <20 wajib istirahat (tidak ditugaskan → regen +35/hari).
- **Kondisi bus (0-100%)**: turun tiap trip, dipengaruhi jarak + skill supir + ada-tidaknya kernet (overload). Di bawah 40% → "Perlu Servis", di bawah 20% → 50% peluang **Mogok** (revenue 0 + denda Rp 5.000.000).
- **Bengkel / Workshop** — pulihkan kondisi ke 100%. Bus yang dijadwalkan service tidak jalan hari itu.
- **Random Events** (35% per dispatch):
  - **Razia Jembatan Timbang** — pilih bayar uang kopi (Rp 500.000) atau tolak (denda Rp 2.000.000 + telat -20% pendapatan).
  - **Macet Parah Tol Cikampek** — BBM trip +50%, kepuasan penumpang -15%.
  - **Viral di TikTok** — boost demand ×1,4 selama 3 hari (cuma trigger bila ada Sleeper aktif atau supir skill ≥8 yang bertugas).
- Dashboard menampilkan **Perhatian Sebelum Berangkat** (warning per bus: tanpa supir, supir lelah, kondisi rendah, dll) sebelum klik BERANGKAT.
- Topbar memperlihatkan **boost Viral aktif** lengkap dengan sisa hari.
- Daily Report memunculkan **event banner**, kerusakan kondisi & stamina per bus, dan tag "Mogok" bila bus rusak di tengah jalan.

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

`netlify.toml` sudah disertakan. Cukup _Connect to Git_ di Netlify, lalu:

- **Build command:** `npm run build`
- **Publish directory:** `dist`

## Struktur

```
src/
  components/
    MainMenu.jsx           Tampilan awal (New / Continue)
    Topbar.jsx             Stat bar + tabs + viral ribbon
    Dashboard.jsx          BERANGKAT + warnings + ringkasan armada
    Dealer.jsx             Beli bus (Phase 1)
    Garasi.jsx             Trayek + supir + kernet + kondisi (Phase 1+2)
    HR.jsx                 Rekrut/pecat supir & kernet, bursa lowongan
    Bengkel.jsx            Service bus (kondisi → 100%)
    DailyReportModal.jsx   Recap setelah BERANGKAT (event + per-bus rincian)
    EventModal.jsx         Razia choice / Macet+Viral acknowledgement
  context/GameContext.jsx  Reducer state + actions
  data/
    busTypes.js            Catalog 3 kelas bus
    cities.js              11 kota Jawa
    distanceMatrix.js      Matriks jarak simetris
    personnel.js           Pool nama, generator candidate, skill tier helpers
  utils/
    economics.js           Math: BBM, tiket, kondisi, stamina, mogok, repair
    events.js              Event roller + effect resolver
    format.js              Locale id-ID Rupiah formatting
    storage.js             localStorage I/O
    id.js                  UUID-like ID generator
```

## Roadmap

- ✅ **Phase 1** — Core engine, fleet, dynamic routes.
- ✅ **Phase 2** — Crew, maintenance, road events.
- ⏳ **Phase 3** — Bank, upgrades, leaderboard.

## Catatan Migrasi Save

Save dari Phase 1 tetap kompatibel — bus lama otomatis dapat field default `condition: 100`, `status: 'idle'`, dan slot crew kosong saat di-hydrate.
