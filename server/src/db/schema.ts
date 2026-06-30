/**
 * 20FIT Shop Inventory — Database schema.
 *
 * Models the entities defined in PRD Section 8 (Data Model & System Structure).
 * The Stock Movement table is the immutable, append-only ledger and the single
 * source of truth; Stock Level is a cached summary recalculated from the ledger
 * (PRD 8.3.4 design note).
 */
export const SCHEMA_SQL = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Access control (PRD 8.3.8, Section 13)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,         -- machine key e.g. 'warehouse_staff'
  name_en       TEXT NOT NULL,
  name_id       TEXT NOT NULL,
  description   TEXT,
  permissions   TEXT NOT NULL DEFAULT '[]'    -- JSON array of permission strings
);

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  role_id             TEXT NOT NULL REFERENCES roles(id),
  assigned_locations  TEXT NOT NULL DEFAULT '[]', -- JSON array of location ids ([] = all)
  is_active           INTEGER NOT NULL DEFAULT 1,
  last_login_at       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Classification (PRD 8.1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name_en     TEXT NOT NULL,
  name_id     TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  contact_info          TEXT NOT NULL DEFAULT '{}', -- JSON {email, phone, contact_person}
  default_lead_time_days INTEGER,
  payment_terms         TEXT,
  is_active             INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Locations (PRD 8.3.3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL DEFAULT 'warehouse', -- warehouse|showroom|consignment|in_transit|quarantine
  address     TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Product master data (PRD 8.3.1 / 8.3.2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  brand_id      TEXT REFERENCES brands(id),
  category_id   TEXT REFERENCES categories(id),
  business_unit TEXT NOT NULL DEFAULT '20fit_shop',
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_variants (
  id                       TEXT PRIMARY KEY,
  product_id               TEXT NOT NULL REFERENCES products(id),
  sku_code                 TEXT NOT NULL UNIQUE,
  barcode                  TEXT,
  variant_attributes       TEXT NOT NULL DEFAULT '{}', -- JSON e.g. {"size":"L","color":"Black"}
  unit_of_measure          TEXT NOT NULL DEFAULT 'pcs',
  cost_price               REAL NOT NULL DEFAULT 0,
  selling_price            REAL NOT NULL DEFAULT 0,
  reorder_point            INTEGER,
  reorder_quantity         INTEGER,
  min_stock                INTEGER,
  max_stock                INTEGER,
  requires_serial_tracking INTEGER NOT NULL DEFAULT 0,
  is_active                INTEGER NOT NULL DEFAULT 1,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Stock level cache (PRD 8.3.4) — recalculated from the movement ledger.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_levels (
  id                TEXT PRIMARY KEY,
  variant_id        TEXT NOT NULL REFERENCES product_variants(id),
  location_id       TEXT NOT NULL REFERENCES locations(id),
  quantity_on_hand  INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  last_updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (variant_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Stock Movement — the core append-only ledger (PRD 8.3.6).
-- Direction is implied by movement_type; quantity is always positive.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id                  TEXT PRIMARY KEY,
  variant_id          TEXT NOT NULL REFERENCES product_variants(id),
  location_id         TEXT NOT NULL REFERENCES locations(id),
  related_location_id TEXT REFERENCES locations(id),  -- other side of a transfer
  movement_type       TEXT NOT NULL,  -- purchase_receipt|sale|transfer_in|transfer_out|return_in|return_out|adjustment_in|adjustment_out|write_off
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost           REAL,
  reference_type      TEXT,           -- purchase_order|sales_order|transfer_order|adjustment|manual
  reference_id        TEXT,
  reason_code         TEXT,
  notes               TEXT,
  performed_by        TEXT NOT NULL REFERENCES users(id),
  performed_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Purchase orders (PRD 8.3.7) — stock-in via goods receipt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            TEXT PRIMARY KEY,
  po_number     TEXT NOT NULL UNIQUE,
  supplier_id   TEXT NOT NULL REFERENCES suppliers(id),
  location_id   TEXT NOT NULL REFERENCES locations(id), -- receiving location
  status        TEXT NOT NULL DEFAULT 'draft', -- draft|submitted|partially_received|received|cancelled
  expected_date TEXT,
  notes         TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id                TEXT PRIMARY KEY,
  po_id             TEXT NOT NULL REFERENCES purchase_orders(id),
  variant_id        TEXT NOT NULL REFERENCES product_variants(id),
  quantity_ordered  INTEGER NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0,
  unit_cost         REAL NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Transfer orders (PRD 9.5) — two linked movements, optional in-transit state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transfer_orders (
  id                      TEXT PRIMARY KEY,
  transfer_number         TEXT NOT NULL UNIQUE,
  source_location_id      TEXT NOT NULL REFERENCES locations(id),
  destination_location_id TEXT NOT NULL REFERENCES locations(id),
  status                  TEXT NOT NULL DEFAULT 'draft', -- draft|in_transit|completed|cancelled
  notes                   TEXT,
  created_by              TEXT NOT NULL REFERENCES users(id),
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  dispatched_at           TEXT,
  completed_at            TEXT
);

CREATE TABLE IF NOT EXISTS transfer_order_lines (
  id          TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES transfer_orders(id),
  variant_id  TEXT NOT NULL REFERENCES product_variants(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0)
);

-- ---------------------------------------------------------------------------
-- Sales order reference (PRD 8.1) — lightweight, supports reservations & returns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_orders (
  id            TEXT PRIMARY KEY,
  order_number  TEXT NOT NULL UNIQUE,
  channel       TEXT NOT NULL DEFAULT 'manual', -- b2c|b2b|pos|ecommerce|manual
  customer_name TEXT,
  location_id   TEXT NOT NULL REFERENCES locations(id),
  status        TEXT NOT NULL DEFAULT 'reserved', -- reserved|fulfilled|cancelled
  notes         TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  fulfilled_at  TEXT
);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id              TEXT PRIMARY KEY,
  sales_order_id  TEXT NOT NULL REFERENCES sales_orders(id),
  variant_id      TEXT NOT NULL REFERENCES product_variants(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      REAL NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Adjustments & write-offs with approval workflow (PRD 7.5, 9.4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adjustments (
  id              TEXT PRIMARY KEY,
  adjustment_number TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL, -- increase|decrease|write_off
  variant_id      TEXT NOT NULL REFERENCES product_variants(id),
  location_id     TEXT NOT NULL REFERENCES locations(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  reason_code     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  notes           TEXT,
  requested_by    TEXT NOT NULL REFERENCES users(id),
  approved_by     TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT
);

-- ---------------------------------------------------------------------------
-- Stock opname / cycle count (PRD 9.6)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_opnames (
  id            TEXT PRIMARY KEY,
  opname_number TEXT NOT NULL UNIQUE,
  location_id   TEXT NOT NULL REFERENCES locations(id),
  category_id   TEXT REFERENCES categories(id), -- null = full count
  status        TEXT NOT NULL DEFAULT 'counting', -- counting|pending_approval|approved|cancelled
  notes         TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id),
  approved_by   TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at   TEXT
);

CREATE TABLE IF NOT EXISTS stock_opname_lines (
  id           TEXT PRIMARY KEY,
  opname_id    TEXT NOT NULL REFERENCES stock_opnames(id),
  variant_id   TEXT NOT NULL REFERENCES product_variants(id),
  expected_qty INTEGER NOT NULL DEFAULT 0,
  counted_qty  INTEGER
);

-- ---------------------------------------------------------------------------
-- Audit log (PRD 8.3.9, NFR Auditability)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id),
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  before_value TEXT,
  after_value  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_movements_variant   ON stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_movements_location  ON stock_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_movements_type      ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_performed ON stock_movements(performed_at);
CREATE INDEX IF NOT EXISTS idx_stocklevels_variant ON stock_levels(variant_id);
CREATE INDEX IF NOT EXISTS idx_variants_product    ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_poline_po           ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity        ON audit_log(entity_type, entity_id);
`;
