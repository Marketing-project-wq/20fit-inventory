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
| Deploy    | Vercel |

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
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **server-only**, set di env Vercel, jangan di client |
| `NEXT_PUBLIC_APP_URL` | Base URL aplikasi |
| `RESEND_API_KEY` | API key Resend untuk email transaksional (OTP reset kata sandi). Tanpa ini, alur OTP tetap berjalan tapi kode dicatat di log server, bukan dikirim via email (fallback dev). |
| `RESEND_FROM` | *(opsional)* Alamat pengirim, mis. `"20FIT Shop <noreply@20fit.id>"`. Default ke nilai tersebut bila kosong. Domain pengirim **harus terverifikasi di dashboard Resend**. |

## Deploy ke Vercel

1. Import repo ini ke Vercel.
2. Tambahkan environment variables di atas di project settings Vercel.
3. Deploy — Vercel otomatis mendeteksi Next.js.

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
