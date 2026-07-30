# 20FIT Shop — Sistem Manajemen Inventaris

Sistem manajemen inventaris untuk **20FIT Shop** (unit distribusi ritel & B2B ekosistem 20FIT,
di bawah PT Kredo AUM). Menggantikan Google Sheet manual dengan platform terpusat: data master
produk/SKU, stok multi-lokasi, ledger mutasi barang append-only, QR Code per SKU, barang masuk
(PO + import packing list), barang keluar (manual + import quotation Xero), stock opname, log akses
gudang, dan pelaporan — **bilingual (Bahasa Indonesia & English)**.

Dibangun dari **PRD v1.4**.

## Tech stack

| Layer     | Teknologi |
|-----------|-----------|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Database  | Supabase (PostgreSQL) |
| Styling   | Tailwind CSS v4 |
| i18n      | next-intl (ID/EN, toggle di UI) |
| Lainnya   | qrcode + html5-qrcode (QR), xlsx + papaparse (import), recharts (chart), react-hook-form + zod (form), lucide-react (ikon) |
| Deploy    | Railway (Nixpacks) |

## Setup

Butuh **Node.js ≥ 20** dan sebuah project **Supabase**.

```bash
# 1. Install dependencies
npm install

# 2. Konfigurasi environment
cp .env.example .env.local
#   lalu isi NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY dari Supabase → Project Settings → API

# 3. Jalankan schema database
#   Buka Supabase → SQL Editor → jalankan isi supabase/schema.sql

# 4. Development
npm run dev            # http://localhost:3000
```

## Environment variables

| Variable | Keterangan |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key (aman untuk browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **server-only**, set di env Railway, jangan di client |
| `NEXT_PUBLIC_APP_URL` | Base URL aplikasi |
| `MAILTRAP_API_TOKEN` | Token API Mailtrap untuk email transaksional (OTP reset kata sandi). Tanpa ini, alur OTP tetap berjalan tapi kode dicatat di log server, bukan dikirim via email (fallback dev). |
| `MAILTRAP_FROM` | *(opsional)* Alamat pengirim, mis. `noreply@20fit.id`. Default ke alamat tersebut bila kosong. Domain pengirim **harus terverifikasi di dashboard Mailtrap**. |

## Deploy ke Railway

Aplikasi di-deploy ke **Railway** (service `20fit-shop-inventory`, domain `shopinventory.20fit.id`).

1. Railway terhubung ke repo GitHub ini dan **auto-deploy** setiap kali branch yang terhubung menerima commit baru.
2. Build memakai **Nixpacks**, yang mendeteksi Next.js secara otomatis — jadi **tidak perlu** `railway.json`, `nixpacks.toml`, atau `Procfile`. Ketiadaan file-file tersebut memang disengaja (deteksi standar Next.js), bukan konfigurasi yang hilang.
3. Environment variables diset di **Railway dashboard** (Service → Variables), bukan di file repo — mis. `SUPABASE_SERVICE_ROLE_KEY`, `MAILTRAP_API_TOKEN`, `MAILTRAP_FROM`, dan variabel Supabase/publik lain sesuai tabel di atas.

## Status pembangunan (bertahap)

- [x] **Fase 0** — Setup proyek (Next.js + Tailwind + dependencies + env)
- [ ] **Fase 1** — Database schema (Supabase)
- [ ] **Fase 2** — Struktur proyek & i18n
- [ ] **Fase 3** — Desain UI (design tokens)
- [ ] **Fase 4** — Fitur inti (dashboard, produk/SKU, barang masuk/keluar, opname, dll.)
- [ ] **Fase 5** — Internasionalisasi (ID/EN)
- [ ] **Fase 6** — QR Code & scanning
- [ ] **Fase 7** — Deployment

---

*Data contoh (SKU, jumlah, harga) bersifat ilustratif, bukan angka riil 20FIT Shop.*
