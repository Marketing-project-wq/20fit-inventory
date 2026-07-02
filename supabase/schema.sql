-- ============================================================
-- 20FIT SHOP INVENTORY SYSTEM — Database Schema
-- Supabase / PostgreSQL — PRD v1.4
--
-- Isolated inside the shared "20FIT ALL DATA" project via a `shop_` table
-- prefix so it never collides with other 20FIT products in `public`.
-- Field names stay snake_case English (only UI text is translated).
-- ============================================================

-- ------------------------------------------------------------
-- REFERENCE / LOOKUP TABLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_brands (
  brand_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES shop_categories(category_id),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3 lokasi terkonfirmasi + bisa tambah
CREATE TABLE IF NOT EXISTS shop_locations (
  location_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  -- 'warehouse' | 'showroom' | 'storage' | 'in-transit'
  type         TEXT NOT NULL DEFAULT 'warehouse',
  address      TEXT,
  is_primary   BOOLEAN DEFAULT false,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_suppliers (
  supplier_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  contact_info           JSONB,
  default_lead_time_days INT,
  payment_terms          TEXT,
  is_active              BOOLEAN DEFAULT true,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- PRODUCTS & VARIANTS (SKU)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_products (
  product_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  name_en        TEXT,
  description    TEXT,
  description_en TEXT,
  brand_id       UUID REFERENCES shop_brands(brand_id),
  category_id    UUID REFERENCES shop_categories(category_id),
  business_unit  TEXT DEFAULT '20FIT Shop',
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_product_variants (
  variant_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id               UUID NOT NULL REFERENCES shop_products(product_id) ON DELETE CASCADE,
  sku_code                 TEXT NOT NULL UNIQUE,   -- QR value = sku_code
  barcode                  TEXT,
  variant_attributes       JSONB,
  unit_of_measure          TEXT DEFAULT 'pcs',
  cost_price               NUMERIC(15,2),          -- harga modal (CENTR)
  selling_price            NUMERIC(15,2),          -- harga jual (20FIT Shop)
  reorder_point            INTEGER,
  reorder_quantity         INTEGER,
  min_stock                INTEGER,
  max_stock                INTEGER,
  requires_serial_tracking BOOLEAN DEFAULT false,
  is_active                BOOLEAN DEFAULT true,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- STOCK LEVELS — cache, selalu dihitung ulang dari stock_movements
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_stock_levels (
  stock_level_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id          UUID NOT NULL REFERENCES shop_product_variants(variant_id),
  location_id         UUID NOT NULL REFERENCES shop_locations(location_id),
  quantity_on_hand    INTEGER NOT NULL DEFAULT 0,
  quantity_reserved   INTEGER NOT NULL DEFAULT 0,
  quantity_available  INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  last_updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (variant_id, location_id)
);

-- ------------------------------------------------------------
-- PURCHASE ORDERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_purchase_orders (
  po_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number      TEXT NOT NULL UNIQUE,
  supplier_id    UUID REFERENCES shop_suppliers(supplier_id),
  status         TEXT NOT NULL DEFAULT 'draft',
  expected_date  DATE,
  notes          TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_purchase_order_lines (
  po_line_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id              UUID NOT NULL REFERENCES shop_purchase_orders(po_id) ON DELETE CASCADE,
  variant_id         UUID NOT NULL REFERENCES shop_product_variants(variant_id),
  quantity_ordered   INTEGER NOT NULL,
  quantity_received  INTEGER NOT NULL DEFAULT 0,
  unit_cost          NUMERIC(15,2),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- STOCK MOVEMENTS — append-only ledger (JANGAN edit/hapus)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_stock_movements (
  movement_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id               UUID NOT NULL REFERENCES shop_product_variants(variant_id),
  location_id              UUID NOT NULL REFERENCES shop_locations(location_id),
  related_location_id      UUID REFERENCES shop_locations(location_id),
  -- 'purchase_receipt' | 'sale' | 'transfer_in' | 'transfer_out'
  -- 'return_in' | 'return_out' | 'adjustment_in' | 'adjustment_out' | 'write_off'
  movement_type            TEXT NOT NULL,
  quantity                 INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost                NUMERIC(15,2),
  -- 'purchase_order' | 'sales_order' | 'transfer_order' | 'adjustment' | 'manual' | 'bulk_import' | 'xero_quotation'
  reference_type           TEXT,
  reference_id             UUID,
  reference_number         TEXT,
  -- 'offline' | 'tokopedia' | 'shopee' | 'b2b_direct' | 'other'
  sales_channel            TEXT,
  marketplace_order_number TEXT,
  reason_code              TEXT,
  performed_by             UUID,
  performed_at             TIMESTAMPTZ DEFAULT NOW(),
  notes                    TEXT,
  CONSTRAINT shop_no_future_performed_at CHECK (performed_at <= NOW() + INTERVAL '1 minute')
);

-- Enforce append-only: block UPDATE & DELETE on the ledger.
CREATE OR REPLACE FUNCTION shop_prevent_movement_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Stock movements are append-only. To correct a mistake, create an offsetting movement.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shop_no_update_movements ON shop_stock_movements;
CREATE TRIGGER shop_no_update_movements
  BEFORE UPDATE ON shop_stock_movements
  FOR EACH ROW EXECUTE FUNCTION shop_prevent_movement_modification();

DROP TRIGGER IF EXISTS shop_no_delete_movements ON shop_stock_movements;
CREATE TRIGGER shop_no_delete_movements
  BEFORE DELETE ON shop_stock_movements
  FOR EACH ROW EXECUTE FUNCTION shop_prevent_movement_modification();

-- ------------------------------------------------------------
-- WAREHOUSE ACCESS LOG — check-in / check-out (SOP Gudang Kuningan)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_warehouse_access_log (
  log_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  UUID NOT NULL REFERENCES shop_locations(location_id),
  user_id      UUID,
  visitor_name TEXT,
  check_in_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_at TIMESTAMPTZ,
  purpose      TEXT,
  notes        TEXT
);

-- ------------------------------------------------------------
-- AUDIT LOG
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_audit_logs (
  log_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    UUID,
  before_value JSONB,
  after_value  JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- STOCK OPNAME (cycle count)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_stock_opname_sessions (
  session_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   UUID NOT NULL REFERENCES shop_locations(location_id),
  status        TEXT NOT NULL DEFAULT 'draft',
  scheduled_at  DATE,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_by    UUID,
  approved_by   UUID,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_stock_opname_lines (
  line_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES shop_stock_opname_sessions(session_id) ON DELETE CASCADE,
  variant_id   UUID NOT NULL REFERENCES shop_product_variants(variant_id),
  expected_qty INTEGER NOT NULL,
  counted_qty  INTEGER,
  variance     INTEGER GENERATED ALWAYS AS (COALESCE(counted_qty, 0) - expected_qty) STORED,
  is_approved  BOOLEAN DEFAULT false,
  notes        TEXT
);

-- ------------------------------------------------------------
-- XERO QUOTATION IMPORT MAPPING (name -> SKU, disimpan agar tak re-map)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_xero_product_mappings (
  mapping_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_description TEXT NOT NULL UNIQUE,
  variant_id       UUID NOT NULL REFERENCES shop_product_variants(variant_id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_shop_movements_variant     ON shop_stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_shop_movements_location    ON shop_stock_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_shop_movements_performed   ON shop_stock_movements(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_movements_type        ON shop_stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_shop_stock_levels_variant  ON shop_stock_levels(variant_id);
CREATE INDEX IF NOT EXISTS idx_shop_stock_levels_location ON shop_stock_levels(location_id);
CREATE INDEX IF NOT EXISTS idx_shop_access_location       ON shop_warehouse_access_log(location_id);
CREATE INDEX IF NOT EXISTS idx_shop_access_checkin        ON shop_warehouse_access_log(check_in_at DESC);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (MVP: public read, authenticated write).
-- Tighten once app auth/roles are wired. Server writes use the service role,
-- which bypasses RLS.
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'shop_brands','shop_categories','shop_locations','shop_suppliers',
    'shop_products','shop_product_variants','shop_stock_levels',
    'shop_purchase_orders','shop_purchase_order_lines','shop_stock_movements',
    'shop_warehouse_access_log','shop_audit_logs','shop_stock_opname_sessions',
    'shop_stock_opname_lines','shop_xero_product_mappings'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t || '_write', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- ATOMIC MOVEMENT RECORDER (PRD §17: atomic stock-out check)
-- Appends a movement and recomputes the cached stock level in one transaction.
-- Outbound movements are blocked if they exceed available stock, unless
-- p_allow_backorder is true.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION shop_record_movement(
  p_variant uuid,
  p_location uuid,
  p_type text,
  p_qty int,
  p_unit_cost numeric DEFAULT NULL,
  p_reference_type text DEFAULT 'manual',
  p_sales_channel text DEFAULT NULL,
  p_marketplace_order text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_allow_backorder boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available int;
  v_outbound boolean := p_type IN ('sale','transfer_out','return_out','adjustment_out','write_off');
  v_movement uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity: quantity must be positive';
  END IF;

  IF v_outbound AND NOT p_allow_backorder THEN
    SELECT (quantity_on_hand - quantity_reserved) INTO v_available
    FROM shop_stock_levels
    WHERE variant_id = p_variant AND location_id = p_location
    FOR UPDATE;
    v_available := COALESCE(v_available, 0);
    IF p_qty > v_available THEN
      RAISE EXCEPTION 'insufficient_stock: available % < requested %', v_available, p_qty;
    END IF;
  END IF;

  INSERT INTO shop_stock_movements(
    variant_id, location_id, movement_type, quantity, unit_cost,
    reference_type, sales_channel, marketplace_order_number, reason_code, notes)
  VALUES (p_variant, p_location, p_type, p_qty, p_unit_cost,
    p_reference_type, p_sales_channel, p_marketplace_order, p_reason, p_notes)
  RETURNING movement_id INTO v_movement;

  INSERT INTO shop_stock_levels(variant_id, location_id, quantity_on_hand, quantity_reserved)
  SELECT p_variant, p_location,
    COALESCE(SUM(CASE WHEN movement_type IN ('purchase_receipt','transfer_in','return_in','adjustment_in')
                 THEN quantity ELSE -quantity END), 0),
    0
  FROM shop_stock_movements
  WHERE variant_id = p_variant AND location_id = p_location
  ON CONFLICT (variant_id, location_id)
  DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand, last_updated_at = NOW();

  RETURN v_movement;
END;
$$;

REVOKE ALL ON FUNCTION shop_record_movement(uuid,uuid,text,int,numeric,text,text,text,text,text,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_record_movement(uuid,uuid,text,int,numeric,text,text,text,text,text,boolean) TO authenticated, service_role;

-- ------------------------------------------------------------
-- TRANSFER & STOCK OPNAME functions (SECURITY DEFINER, called as the
-- authenticated user — no service role required).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION shop_recompute_level(p_variant uuid, p_location uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO shop_stock_levels(variant_id, location_id, quantity_on_hand, quantity_reserved)
  SELECT p_variant, p_location,
    COALESCE(SUM(CASE WHEN movement_type IN ('purchase_receipt','transfer_in','return_in','adjustment_in')
                 THEN quantity ELSE -quantity END), 0), 0
  FROM shop_stock_movements WHERE variant_id = p_variant AND location_id = p_location
  ON CONFLICT (variant_id, location_id)
  DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand, last_updated_at = NOW();
END; $$;

CREATE OR REPLACE FUNCTION shop_record_transfer(
  p_variant uuid, p_from uuid, p_to uuid, p_qty int,
  p_notes text DEFAULT NULL, p_allow_backorder boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_available int; v_ref uuid := gen_random_uuid();
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'same_location'; END IF;
  IF NOT p_allow_backorder THEN
    SELECT (quantity_on_hand - quantity_reserved) INTO v_available
    FROM shop_stock_levels WHERE variant_id = p_variant AND location_id = p_from FOR UPDATE;
    v_available := COALESCE(v_available, 0);
    IF p_qty > v_available THEN
      RAISE EXCEPTION 'insufficient_stock: available % < requested %', v_available, p_qty;
    END IF;
  END IF;
  INSERT INTO shop_stock_movements(variant_id, location_id, related_location_id, movement_type, quantity, reference_type, reference_id, notes)
  VALUES (p_variant, p_from, p_to, 'transfer_out', p_qty, 'transfer_order', v_ref, p_notes);
  INSERT INTO shop_stock_movements(variant_id, location_id, related_location_id, movement_type, quantity, reference_type, reference_id, notes)
  VALUES (p_variant, p_to, p_from, 'transfer_in', p_qty, 'transfer_order', v_ref, p_notes);
  PERFORM shop_recompute_level(p_variant, p_from);
  PERFORM shop_recompute_level(p_variant, p_to);
  RETURN v_ref;
END; $$;

CREATE OR REPLACE FUNCTION shop_create_opname(p_location uuid, p_user uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid := gen_random_uuid();
BEGIN
  INSERT INTO shop_stock_opname_sessions(session_id, location_id, status, started_at, created_by)
  VALUES (v_session, p_location, 'in_progress', NOW(), p_user);
  INSERT INTO shop_stock_opname_lines(session_id, variant_id, expected_qty)
  SELECT v_session, sl.variant_id, sl.quantity_on_hand
  FROM shop_stock_levels sl WHERE sl.location_id = p_location;
  RETURN v_session;
END; $$;

CREATE OR REPLACE FUNCTION shop_save_opname_counts(p_session uuid, p_counts jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE shop_stock_opname_lines l
  SET counted_qty = CASE
        WHEN (p_counts ->> l.line_id::text) IS NULL OR (p_counts ->> l.line_id::text) = ''
        THEN NULL ELSE (p_counts ->> l.line_id::text)::int END
  WHERE l.session_id = p_session AND p_counts ? l.line_id::text;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION shop_apply_opname(p_session uuid, p_user uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_loc uuid; v_count int := 0; v_diff int; v_type text;
BEGIN
  SELECT location_id INTO v_loc FROM shop_stock_opname_sessions WHERE session_id = p_session FOR UPDATE;
  IF v_loc IS NULL THEN RAISE EXCEPTION 'session_not_found'; END IF;
  FOR r IN SELECT line_id, variant_id, expected_qty, counted_qty
           FROM shop_stock_opname_lines WHERE session_id = p_session AND counted_qty IS NOT NULL
  LOOP
    v_diff := r.counted_qty - r.expected_qty;
    IF v_diff <> 0 THEN
      v_type := CASE WHEN v_diff > 0 THEN 'adjustment_in' ELSE 'adjustment_out' END;
      INSERT INTO shop_stock_movements(variant_id, location_id, movement_type, quantity, reference_type, reference_id, reason_code, notes)
      VALUES (r.variant_id, v_loc, v_type, abs(v_diff), 'adjustment', p_session, 'stock_opname', 'Penyesuaian hasil stock opname');
      PERFORM shop_recompute_level(r.variant_id, v_loc);
      v_count := v_count + 1;
    END IF;
    UPDATE shop_stock_opname_lines SET is_approved = true WHERE line_id = r.line_id;
  END LOOP;
  UPDATE shop_stock_opname_sessions SET status = 'completed', completed_at = NOW(), approved_by = p_user WHERE session_id = p_session;
  RETURN v_count;
END; $$;

-- ------------------------------------------------------------
-- PACKING LIST IMPORT: bulk goods-in from a supplier packing list. Records one
-- purchase_receipt movement per item, atomically, reusing shop_record_movement.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION shop_import_packing_list(
  p_location uuid,
  p_items jsonb,
  p_reference text DEFAULT NULL
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb; v_count int := 0;
BEGIN
  IF p_location IS NULL THEN RAISE EXCEPTION 'invalid_location'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'invalid_items'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    PERFORM shop_record_movement(
      (v_item->>'variant_id')::uuid, p_location, 'purchase_receipt',
      (v_item->>'quantity')::int, NULLIF(v_item->>'unit_cost','')::numeric,
      'packing_list', NULL, NULL, NULL, p_reference, false);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'shop_record_transfer(uuid,uuid,uuid,int,text,boolean)',
    'shop_create_opname(uuid,uuid)',
    'shop_save_opname_counts(uuid,jsonb)',
    'shop_apply_opname(uuid,uuid)',
    'shop_import_packing_list(uuid,jsonb,text)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
