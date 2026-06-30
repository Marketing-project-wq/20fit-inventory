# 20FIT Shop — Inventory Management System

Warehouse stock, goods movement & multi-channel inventory control for **20FIT Shop**
(the retail & B2B equipment distribution unit of the 20FIT ecosystem, under PT Kredo AUM).

This is a full-stack implementation of the *20FIT Shop Inventory Management System* PRD
(v1.0, 30 June 2026). It provides a single source of truth for product master data, multi-location
stock levels, an append-only goods-movement ledger, purchase orders & goods receipt, inter-location
transfers, stock adjustments & write-offs with approval, stock opname (cycle counting), reporting,
a management dashboard, role-based access control, and password authentication — fully bilingual in
**Bahasa Indonesia** and **English**.

---

## Tech stack

| Layer    | Technology |
|----------|------------|
| Backend  | Node.js 22 · Express · TypeScript · `node:sqlite` (built-in SQLite) |
| Auth     | Password login with **bcrypt** hashing + **JWT** bearer tokens |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · React Router |
| i18n     | `react-i18next` — Bahasa Indonesia + English, persisted per user |

No external database or service is required — SQLite runs in-process, so the whole system
starts with a single `npm install`.

## Project structure

```
20fit-inventory/
├── server/                 # Express + TypeScript API
│   ├── src/
│   │   ├── db/             # schema, connection (transactions), seed
│   │   ├── services/       # stock ledger (atomic movements), audit
│   │   ├── middleware/     # auth (JWT), RBAC, error handling
│   │   ├── routes/         # auth, products, movements, PO, transfers, …
│   │   ├── constants.ts    # movement types, reason codes, role→permission matrix
│   │   └── index.ts        # app entry
│   └── data/inventory.db   # SQLite file (created on first run, git-ignored)
└── web/                    # React + Vite frontend
    └── src/
        ├── i18n/           # en.json + id.json
        ├── pages/          # one page per screen
        ├── components/     # Layout, UI kit, Toast
        └── auth/           # auth context
```

## Getting started

Requires **Node.js ≥ 22.5** (for the built-in `node:sqlite` module).

```bash
# 1. Install all workspace dependencies (root + server + web)
npm install

# 2. Seed the database with demo data (catalog, users, opening stock)
npm run seed

# 3. Run backend (:4000) and frontend (:5173) together
npm run dev
```

Then open **http://localhost:5173**.

> Run the backend and frontend separately with `npm run dev:server` and `npm run dev:web`.

### Demo accounts

Every account uses the password **`20fit1234`**. The login screen lists them as one-click buttons.

| Email | Role | Highlights |
|-------|------|-----------|
| `admin@20fit.id` | System Administrator | Everything, incl. user management |
| `ops@20fit.id` | Operations Lead | Approves adjustments & opname, all locations |
| `purchasing@20fit.id` | Purchasing Owner | Purchase orders, goods receipt, cost data |
| `warehouse@20fit.id` | Warehouse Staff | Stock-in, transfers, counts; requests adjustments |
| `shop@20fit.id` | Shop / Sales Staff | Records sales & returns; no cost data |
| `finance@20fit.id` | Finance | Valuation, reports, audit — read-only on stock |
| `exec@20fit.id` | Executive | Dashboard & reports |

## Feature coverage (mapped to the PRD)

| PRD section | Implemented |
|-------------|-------------|
| 7.1 Product / SKU master data | Products, variants (SKUs), brands, categories, UoM, prices, serial flag |
| 7.2 Stock level tracking | On-hand / reserved / available per SKU per location |
| 7.3 Goods in | Purchase orders + goods receipt (partial, over-receipt flagged), ad-hoc stock-in, returns |
| 7.4 Goods out | Sale (with availability check + backorder override), transfers, write-offs |
| 7.5 Adjustments & cycle count | Adjustments with approval (separation of duties), stock opname with variance |
| 7.6 Alerts | Low-stock / out-of-stock status surfaced on dashboard & stock screens |
| 7.7 / 12 Reporting | Stock on hand, valuation, low stock, fast/slow movers, dead stock, PO status, write-offs |
| 8 Data model | Relational schema with **append-only Stock Movement ledger** as source of truth |
| 9 Workflows | Purchase receipt, customer return (condition → quarantine), sale, write-off, transfer, opname |
| 11 Non-functional | Atomic stock checks (DB transactions), RBAC, audit trail, **ID/EN localization** |
| 13 Permissions | Role → permission matrix enforced on every endpoint and in the UI |
| 16 Notifications | In-app low-stock watchlist, pending-approval & overdue-PO surfacing |
| 17 Edge cases | Oversell block, mandatory reason codes, duplicate SKU rejection, deactivation guard, over-receipt variance |

### Design decisions worth noting

- **The Stock Movement table is append-only.** Stock levels are a cache recomputed from the ledger
  (`recomputeStockLevels`), exactly as the PRD's 8.3.4 design note prescribes. Corrections are made
  via offsetting movements, never edits.
- **Atomic stock checks.** Every stock-affecting action runs inside a `BEGIN IMMEDIATE` transaction so
  the availability check and the write cannot race (PRD §17 — concurrent stock-out protection).
- **Separation of duties.** A user cannot approve an adjustment they requested.
- **Financial data gating.** Cost prices, unit costs and valuation are hidden from roles without the
  `financial:view` permission (warehouse & shop staff), both in the API responses and the UI.

## API overview

All endpoints are under `/api`. Authenticate with `POST /api/auth/login`, then send
`Authorization: Bearer <token>`.

```
POST   /api/auth/login                 GET  /api/dashboard
GET    /api/auth/me                     GET  /api/products  ·  /api/variants  ·  /api/products/:id
POST   /api/auth/change-password        POST /api/products  ·  /api/variants
GET    /api/stock-levels                GET  /api/movements
POST   /api/movements/stock-in|sale|return
GET/POST /api/purchase-orders           POST /api/purchase-orders/:id/receive
GET/POST /api/transfers                 POST /api/transfers/:id/dispatch|receive|cancel
GET/POST /api/adjustments               POST /api/adjustments/:id/approve|reject
GET/POST /api/opnames                   PATCH /api/opnames/:id/count · POST …/submit|approve
GET    /api/reports/{stock-on-hand,valuation,low-stock,movers,dead-stock,po-status,write-offs}
GET    /api/brands · /api/categories · /api/locations · /api/suppliers
GET/POST /api/users  ·  GET /api/roles  ·  GET /api/audit-log
```

## Production build

```bash
npm run build                 # builds the web bundle into web/dist
npm run start --workspace server   # serves the compiled API
```

The frontend can be served as static files (e.g. behind nginx) and pointed at the API via the
`/api` proxy. Configuration lives in `server/.env` (`PORT`, `JWT_SECRET`, `DB_PATH`, `CORS_ORIGIN`).

---

*This system was built from the 20FIT Shop Inventory Management System PRD. Figures and sample data
(SKUs, quantities, prices) are illustrative seed data, not real 20FIT Shop figures.*
