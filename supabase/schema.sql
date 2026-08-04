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
-- PACKING LIST IMPORT: bulk goods-in from a supplier (China) packing list.
-- Learned mapping table (mirrors shop_xero_product_mappings) + an atomic RPC
-- that records one purchase_receipt per item and learns each confirmed mapping.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_packing_list_mappings (
  mapping_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_description TEXT NOT NULL UNIQUE,
  variant_id         UUID NOT NULL REFERENCES shop_product_variants(variant_id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shop_packing_list_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_packing_map_read ON shop_packing_list_mappings;
CREATE POLICY shop_packing_map_read ON shop_packing_list_mappings
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON shop_packing_list_mappings TO authenticated;

CREATE OR REPLACE FUNCTION shop_import_packing_list(
  p_location uuid,
  p_items jsonb,          -- [{variant_id, quantity, unit_cost, description}]
  p_reference text DEFAULT NULL
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb; v_count int := 0; v_variant uuid; v_desc text; v_cost numeric;
BEGIN
  IF p_location IS NULL THEN RAISE EXCEPTION 'invalid_location'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'invalid_items'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant := (v_item->>'variant_id')::uuid;
    v_desc := v_item->>'description';
    -- Fall back to the SKU's master cost_price when the file row has no price.
    v_cost := COALESCE(
      NULLIF(v_item->>'unit_cost','')::numeric,
      (SELECT cost_price FROM shop_product_variants WHERE variant_id = v_variant)
    );
    PERFORM shop_record_movement(
      v_variant, p_location, 'purchase_receipt',
      (v_item->>'quantity')::int, v_cost,
      'bulk_import', NULL, NULL, NULL, p_reference, false);
    IF v_variant IS NOT NULL AND v_desc IS NOT NULL AND length(btrim(v_desc)) > 0 THEN
      INSERT INTO shop_packing_list_mappings(source_description, variant_id)
      VALUES (btrim(v_desc), v_variant)
      ON CONFLICT (source_description) DO UPDATE SET variant_id = EXCLUDED.variant_id, updated_at = NOW();
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- ------------------------------------------------------------
-- XERO QUOTATION IMPORT: learned mapping table + record a quotation as B2B
-- goods-out (sales). Mapping = Xero free-text Description -> internal variant.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_xero_product_mappings (
  mapping_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_description TEXT NOT NULL UNIQUE,
  variant_id       UUID NOT NULL REFERENCES shop_product_variants(variant_id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shop_xero_product_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_xero_map_read ON shop_xero_product_mappings;
CREATE POLICY shop_xero_map_read ON shop_xero_product_mappings
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON shop_xero_product_mappings TO authenticated;

-- Record a Xero quotation as B2B sales atomically, and learn each confirmed
-- Description->variant mapping. Reuses the oversell + recompute logic.
CREATE OR REPLACE FUNCTION shop_import_xero_sale(
  p_location uuid,
  p_reference text,             -- quote number, e.g. 'QU-0798'
  p_customer text,              -- customer name
  p_items jsonb,                -- [{variant_id, quantity, description}]
  p_allow_backorder boolean DEFAULT false
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb; v_count int := 0;
  v_variant uuid; v_qty int; v_desc text; v_available int; v_note text;
BEGIN
  IF p_location IS NULL THEN RAISE EXCEPTION 'invalid_location'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'invalid_items'; END IF;
  v_note := NULLIF(btrim(coalesce(p_customer, '')), '');
  v_note := btrim(concat_ws(' — ', v_note, 'Import dari Xero'));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant := (v_item->>'variant_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_desc := v_item->>'description';
    IF v_variant IS NULL THEN RAISE EXCEPTION 'invalid_variant'; END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

    IF NOT p_allow_backorder THEN
      SELECT (quantity_on_hand - quantity_reserved) INTO v_available
      FROM shop_stock_levels WHERE variant_id = v_variant AND location_id = p_location FOR UPDATE;
      v_available := COALESCE(v_available, 0);
      IF v_qty > v_available THEN
        RAISE EXCEPTION 'insufficient_stock: "%" available % < requested %',
          coalesce(v_desc, ''), v_available, v_qty;
      END IF;
    END IF;

    INSERT INTO shop_stock_movements(
      variant_id, location_id, movement_type, quantity,
      reference_type, reference_number, sales_channel, notes)
    VALUES (v_variant, p_location, 'sale', v_qty,
      'xero_quotation', NULLIF(btrim(coalesce(p_reference,'')), ''), 'b2b_direct', v_note);

    PERFORM shop_recompute_level(v_variant, p_location);

    IF v_desc IS NOT NULL AND length(btrim(v_desc)) > 0 THEN
      INSERT INTO shop_xero_product_mappings(xero_description, variant_id)
      VALUES (btrim(v_desc), v_variant)
      ON CONFLICT (xero_description)
        DO UPDATE SET variant_id = EXCLUDED.variant_id, updated_at = NOW();
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END; $$;

-- ------------------------------------------------------------
-- SETTINGS: create a product + its variant atomically (add SKU).
-- (Variant/price/location edits go directly under the authenticated RLS policy.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION shop_create_sku(
  p_name text, p_name_en text, p_sku_code text,
  p_category uuid, p_brand uuid,
  p_cost numeric, p_selling numeric, p_reorder int, p_unit text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_product uuid; v_variant uuid;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF p_sku_code IS NULL OR btrim(p_sku_code) = '' THEN RAISE EXCEPTION 'invalid_sku'; END IF;
  IF EXISTS (SELECT 1 FROM shop_product_variants WHERE sku_code = btrim(p_sku_code)) THEN
    RAISE EXCEPTION 'sku_exists';
  END IF;
  INSERT INTO shop_products(name, name_en, brand_id, category_id)
    VALUES (btrim(p_name), NULLIF(btrim(coalesce(p_name_en, '')), ''), p_brand, p_category)
    RETURNING product_id INTO v_product;
  INSERT INTO shop_product_variants(
    product_id, sku_code, cost_price, selling_price, reorder_point, unit_of_measure)
    VALUES (v_product, btrim(p_sku_code), p_cost, p_selling, p_reorder,
            coalesce(NULLIF(btrim(coalesce(p_unit, '')), ''), 'pcs'))
    RETURNING variant_id INTO v_variant;
  RETURN v_variant;
END; $$;
REVOKE ALL ON FUNCTION shop_create_sku(text,text,text,uuid,uuid,numeric,numeric,int,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_create_sku(text,text,text,uuid,uuid,numeric,numeric,int,text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- STAFF & ROLES — 20FIT Shop-specific staff registry, separate from the shared
-- auth.users. Roles: admin | manager | staff | viewer.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_staff (
  staff_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  TEXT NOT NULL,
  email      TEXT UNIQUE,
  phone      TEXT,
  role       TEXT NOT NULL DEFAULT 'staff',
  user_id    UUID,
  is_active  BOOLEAN DEFAULT true,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT shop_staff_role_chk CHECK (role IN ('super_admin','admin','manager','staff','viewer','pending'))
);
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_staff_read ON shop_staff;
CREATE POLICY shop_staff_read ON shop_staff FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shop_staff_write ON shop_staff;
CREATE POLICY shop_staff_write ON shop_staff FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_staff TO authenticated;

DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'shop_record_transfer(uuid,uuid,uuid,int,text,boolean)',
    'shop_create_opname(uuid,uuid)',
    'shop_save_opname_counts(uuid,jsonb)',
    'shop_apply_opname(uuid,uuid)',
    'shop_import_packing_list(uuid,jsonb,text)',
    'shop_import_xero_sale(uuid,text,text,jsonb,boolean)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- ============================================================================
-- MIGRATION (2026-07): Sales staff picklist + transfer proof photo + access
-- visitor as sales/DW. Applied to the live DB; kept here idempotently so a
-- fresh provision reproduces it.
-- ============================================================================

-- Sales staff = names for the Transfer / Warehouse Access dropdowns.
-- Distinct from shop_staff (login accounts).
CREATE TABLE IF NOT EXISTS shop_sales_staff (
  staff_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shop_sales_staff_name_unique UNIQUE (name)
);
ALTER TABLE shop_sales_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_sales_staff_read ON shop_sales_staff;
CREATE POLICY shop_sales_staff_read ON shop_sales_staff FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shop_sales_staff_write ON shop_sales_staff;
CREATE POLICY shop_sales_staff_write ON shop_sales_staff FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_sales_staff TO authenticated;

INSERT INTO shop_sales_staff (name, sort_order) VALUES
  ('Fandi', 1), ('Yonatan', 2), ('Riztira', 3)
ON CONFLICT (name) DO NOTHING;

-- Warehouse access: visitor is a sales staff or a daily worker.
-- visitor_name kept as fallback for historical rows.
ALTER TABLE shop_warehouse_access_log
  ADD COLUMN IF NOT EXISTS sales_staff_id UUID REFERENCES shop_sales_staff(staff_id),
  ADD COLUMN IF NOT EXISTS dw_name TEXT;

-- Transfers: who moved it + proof photo. (ADD COLUMN is allowed; the append-only
-- trigger only blocks UPDATE/DELETE of existing rows.)
ALTER TABLE shop_stock_movements
  ADD COLUMN IF NOT EXISTS sales_staff_id UUID REFERENCES shop_sales_staff(staff_id),
  ADD COLUMN IF NOT EXISTS dw_name TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Transfer RPC now records sales staff / DW / photo on both legs.
DROP FUNCTION IF EXISTS shop_record_transfer(uuid,uuid,uuid,int,text,boolean);
CREATE OR REPLACE FUNCTION shop_record_transfer(
  p_variant uuid, p_from uuid, p_to uuid, p_qty int,
  p_notes text DEFAULT NULL, p_allow_backorder boolean DEFAULT false,
  p_sales_staff_id uuid DEFAULT NULL, p_dw_name text DEFAULT NULL, p_photo_url text DEFAULT NULL
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
  INSERT INTO shop_stock_movements(variant_id, location_id, related_location_id, movement_type, quantity, reference_type, reference_id, notes, sales_staff_id, dw_name, photo_url)
  VALUES (p_variant, p_from, p_to, 'transfer_out', p_qty, 'transfer_order', v_ref, p_notes, p_sales_staff_id, p_dw_name, p_photo_url);
  INSERT INTO shop_stock_movements(variant_id, location_id, related_location_id, movement_type, quantity, reference_type, reference_id, notes, sales_staff_id, dw_name, photo_url)
  VALUES (p_variant, p_to, p_from, 'transfer_in', p_qty, 'transfer_order', v_ref, p_notes, p_sales_staff_id, p_dw_name, p_photo_url);
  PERFORM shop_recompute_level(p_variant, p_from);
  PERFORM shop_recompute_level(p_variant, p_to);
  RETURN v_ref;
END; $$;
REVOKE ALL ON FUNCTION shop_record_transfer(uuid,uuid,uuid,int,text,boolean,uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_record_transfer(uuid,uuid,uuid,int,text,boolean,uuid,text,text) TO authenticated, service_role;

-- Private bucket for transfer proof photos (accessed via signed URLs).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('transfer-photos','transfer-photos', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS transfer_photos_insert ON storage.objects;
CREATE POLICY transfer_photos_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'transfer-photos');
DROP POLICY IF EXISTS transfer_photos_read ON storage.objects;
CREATE POLICY transfer_photos_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'transfer-photos');

-- ============================================================================
-- MIGRATION (2026-07): Returns & damaged goods in the Goods In module.
--   1. Retur — stock returned to the warehouse in good OR damaged condition.
--   2. Barang Masuk Rusak — goods received already damaged, kept OUT of the
--      sellable pool (notes + photo required).
-- Stock is now split by `condition` ('good' | 'damaged'). Damaged stock never
-- counts as sellable / available. Applied to the live DB; kept here idempotently
-- so a fresh provision reproduces it. NOTE: this section runs after the base
-- definitions above and intentionally REPLACES the level/movement/transfer/
-- xero/opname functions with condition-aware versions.
-- ============================================================================

-- Stock levels are now keyed per condition: a (variant, location) can hold both
-- a 'good' row and a 'damaged' row. Replace the old 2-col unique with a 3-col one.
ALTER TABLE shop_stock_levels
  ADD COLUMN IF NOT EXISTS condition TEXT NOT NULL DEFAULT 'good'
    CHECK (condition IN ('good','damaged'));
ALTER TABLE shop_stock_levels
  DROP CONSTRAINT IF EXISTS shop_stock_levels_variant_id_location_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_stock_levels_variant_location_condition_key'
      AND conrelid = 'shop_stock_levels'::regclass
  ) THEN
    ALTER TABLE shop_stock_levels
      ADD CONSTRAINT shop_stock_levels_variant_location_condition_key
      UNIQUE (variant_id, location_id, condition);
  END IF;
END $$;

-- Each ledger row carries the condition of the goods it moved. (ADD COLUMN is
-- allowed; the append-only trigger only blocks UPDATE/DELETE of existing rows.)
ALTER TABLE shop_stock_movements
  ADD COLUMN IF NOT EXISTS item_condition TEXT NOT NULL DEFAULT 'good'
    CHECK (item_condition IN ('good','damaged'));

-- Recompute now sums per condition into the matching level row. New inbound
-- types: damage_in (received damaged), return_in_damaged (returned damaged).
CREATE OR REPLACE FUNCTION shop_recompute_level(p_variant uuid, p_location uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['good','damaged'] LOOP
    INSERT INTO shop_stock_levels(variant_id, location_id, condition, quantity_on_hand, quantity_reserved)
    SELECT p_variant, p_location, c,
      COALESCE(SUM(CASE WHEN movement_type IN ('purchase_receipt','transfer_in','return_in','adjustment_in','damage_in','return_in_damaged')
                   THEN quantity ELSE -quantity END), 0), 0
    FROM shop_stock_movements
    WHERE variant_id = p_variant AND location_id = p_location AND item_condition = c
    ON CONFLICT (variant_id, location_id, condition)
    DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand, last_updated_at = NOW();
  END LOOP;
END; $$;

-- Movement recorder gains p_item_condition / p_photo_url / p_reference_number.
-- The outbound stock check is scoped to the moving condition so damaged stock
-- can never satisfy a good-stock sale (and vice versa). damage_out is outbound.
DROP FUNCTION IF EXISTS shop_record_movement(uuid,uuid,text,int,numeric,text,text,text,text,text,boolean);
CREATE OR REPLACE FUNCTION shop_record_movement(
  p_variant uuid, p_location uuid, p_type text, p_qty int,
  p_unit_cost numeric DEFAULT NULL, p_reference_type text DEFAULT 'manual',
  p_sales_channel text DEFAULT NULL, p_marketplace_order text DEFAULT NULL,
  p_reason text DEFAULT NULL, p_notes text DEFAULT NULL, p_allow_backorder boolean DEFAULT false,
  p_item_condition text DEFAULT 'good', p_photo_url text DEFAULT NULL, p_reference_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_available int;
  v_outbound boolean := p_type IN ('sale','transfer_out','return_out','adjustment_out','write_off','damage_out');
  v_movement uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity: quantity must be positive'; END IF;
  IF v_outbound AND NOT p_allow_backorder THEN
    SELECT (quantity_on_hand - quantity_reserved) INTO v_available FROM shop_stock_levels
    WHERE variant_id = p_variant AND location_id = p_location AND condition = p_item_condition FOR UPDATE;
    v_available := COALESCE(v_available, 0);
    IF p_qty > v_available THEN RAISE EXCEPTION 'insufficient_stock: available % < requested %', v_available, p_qty; END IF;
  END IF;
  INSERT INTO shop_stock_movements(variant_id, location_id, movement_type, quantity, unit_cost,
    reference_type, sales_channel, marketplace_order_number, reason_code, notes, item_condition, photo_url, reference_number, performed_by)
  VALUES (p_variant, p_location, p_type, p_qty, p_unit_cost, p_reference_type, p_sales_channel,
    p_marketplace_order, p_reason, p_notes, p_item_condition, p_photo_url, p_reference_number, auth.uid())
  RETURNING movement_id INTO v_movement;
  PERFORM shop_recompute_level(p_variant, p_location);
  RETURN v_movement;
END; $$;
REVOKE ALL ON FUNCTION shop_record_movement(uuid,uuid,text,int,numeric,text,text,text,text,text,boolean,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_record_movement(uuid,uuid,text,int,numeric,text,text,text,text,text,boolean,text,text,text) TO authenticated, service_role;

-- Transfer / Xero sale / Opname read only GOOD stock. Without this guard the
-- per-condition split turns their `SELECT ... INTO` into a multi-row error and
-- damaged units would leak into sellable counts.
CREATE OR REPLACE FUNCTION shop_record_transfer(
  p_variant uuid, p_from uuid, p_to uuid, p_qty int,
  p_notes text DEFAULT NULL, p_allow_backorder boolean DEFAULT false,
  p_sales_staff_id uuid DEFAULT NULL, p_dw_name text DEFAULT NULL, p_photo_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_available int; v_ref uuid := gen_random_uuid();
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'same_location'; END IF;
  IF NOT p_allow_backorder THEN
    SELECT (quantity_on_hand - quantity_reserved) INTO v_available
    FROM shop_stock_levels WHERE variant_id = p_variant AND location_id = p_from AND condition = 'good' FOR UPDATE;
    v_available := COALESCE(v_available, 0);
    IF p_qty > v_available THEN
      RAISE EXCEPTION 'insufficient_stock: available % < requested %', v_available, p_qty;
    END IF;
  END IF;
  INSERT INTO shop_stock_movements(variant_id, location_id, related_location_id, movement_type, quantity, reference_type, reference_id, notes, sales_staff_id, dw_name, photo_url)
  VALUES (p_variant, p_from, p_to, 'transfer_out', p_qty, 'transfer_order', v_ref, p_notes, p_sales_staff_id, p_dw_name, p_photo_url);
  INSERT INTO shop_stock_movements(variant_id, location_id, related_location_id, movement_type, quantity, reference_type, reference_id, notes, sales_staff_id, dw_name, photo_url)
  VALUES (p_variant, p_to, p_from, 'transfer_in', p_qty, 'transfer_order', v_ref, p_notes, p_sales_staff_id, p_dw_name, p_photo_url);
  PERFORM shop_recompute_level(p_variant, p_from);
  PERFORM shop_recompute_level(p_variant, p_to);
  RETURN v_ref;
END; $$;
REVOKE ALL ON FUNCTION shop_record_transfer(uuid,uuid,uuid,int,text,boolean,uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_record_transfer(uuid,uuid,uuid,int,text,boolean,uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION shop_import_xero_sale(
  p_location uuid, p_reference text, p_customer text, p_items jsonb, p_allow_backorder boolean DEFAULT false
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb; v_count int := 0; v_variant uuid; v_qty int; v_desc text; v_available int; v_note text;
BEGIN
  IF p_location IS NULL THEN RAISE EXCEPTION 'invalid_location'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'invalid_items'; END IF;
  v_note := NULLIF(btrim(coalesce(p_customer, '')), '');
  v_note := btrim(concat_ws(' — ', v_note, 'Import dari Xero'));
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant := (v_item->>'variant_id')::uuid; v_qty := (v_item->>'quantity')::int; v_desc := v_item->>'description';
    IF v_variant IS NULL THEN RAISE EXCEPTION 'invalid_variant'; END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
    IF NOT p_allow_backorder THEN
      SELECT (quantity_on_hand - quantity_reserved) INTO v_available
      FROM shop_stock_levels WHERE variant_id = v_variant AND location_id = p_location AND condition = 'good' FOR UPDATE;
      v_available := COALESCE(v_available, 0);
      IF v_qty > v_available THEN RAISE EXCEPTION 'insufficient_stock: "%" available % < requested %', coalesce(v_desc, ''), v_available, v_qty; END IF;
    END IF;
    INSERT INTO shop_stock_movements(variant_id, location_id, movement_type, quantity, reference_type, reference_number, sales_channel, notes)
    VALUES (v_variant, p_location, 'sale', v_qty, 'xero_quotation', NULLIF(btrim(coalesce(p_reference,'')), ''), 'b2b_direct', v_note);
    PERFORM shop_recompute_level(v_variant, p_location);
    IF v_desc IS NOT NULL AND length(btrim(v_desc)) > 0 THEN
      INSERT INTO shop_xero_product_mappings(xero_description, variant_id) VALUES (btrim(v_desc), v_variant)
      ON CONFLICT (xero_description) DO UPDATE SET variant_id = EXCLUDED.variant_id, updated_at = NOW();
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION shop_create_opname(p_location uuid, p_user uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid := gen_random_uuid();
BEGIN
  INSERT INTO shop_stock_opname_sessions(session_id, location_id, status, started_at, created_by)
  VALUES (v_session, p_location, 'in_progress', NOW(), p_user);
  INSERT INTO shop_stock_opname_lines(session_id, variant_id, expected_qty)
  SELECT v_session, sl.variant_id, sl.quantity_on_hand
  FROM shop_stock_levels sl WHERE sl.location_id = p_location AND sl.condition = 'good';
  RETURN v_session;
END; $$;

-- Private bucket for damaged / returned item photos (accessed via signed URLs).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('item-photos','item-photos', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS item_photos_insert ON storage.objects;
CREATE POLICY item_photos_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'item-photos');
DROP POLICY IF EXISTS item_photos_read ON storage.objects;
CREATE POLICY item_photos_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'item-photos');

-- ============================================================================
-- MIGRATION (2026-07): Warranty / repair goods-out.
-- Damaged stock (item_condition='damaged') can be shipped to a supplier or
-- service center for a warranty claim or repair (movement_type='warranty_out').
-- warranty_out draws from the DAMAGED pool and is tracked via shop_warranty_claims.
-- Repaired/replacement units come back through the normal Goods In (return_in,
-- condition good). Applied to the live DB; kept here idempotently.
-- ============================================================================

-- Nomor klaim garansi / tiket perbaikan pada baris ledger warranty_out.
ALTER TABLE shop_stock_movements
  ADD COLUMN IF NOT EXISTS warranty_claim_number TEXT;

-- Warranty claim tracking (one claim per shipment; status over time).
CREATE TABLE IF NOT EXISTS shop_warranty_claims (
  claim_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number     TEXT NOT NULL UNIQUE,          -- WC-YYYY-XXXX
  supplier_name    TEXT,                          -- supplier / service center tujuan
  status           TEXT NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent','in_repair','resolved','rejected','closed')),
  sent_at          TIMESTAMPTZ DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  resolution_notes TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_warranty_claims_number ON shop_warranty_claims(claim_number);
CREATE INDEX IF NOT EXISTS idx_shop_warranty_claims_status ON shop_warranty_claims(status);

ALTER TABLE shop_warranty_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_warranty_claims_read ON shop_warranty_claims;
CREATE POLICY shop_warranty_claims_read ON shop_warranty_claims FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shop_warranty_claims_write ON shop_warranty_claims;
CREATE POLICY shop_warranty_claims_write ON shop_warranty_claims FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_warranty_claims TO authenticated;

-- Auto-generate internal claim number WC-YYYY-XXXX.
CREATE SEQUENCE IF NOT EXISTS shop_warranty_claim_seq START 1;
CREATE OR REPLACE FUNCTION shop_generate_warranty_claim_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN 'WC-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
         LPAD(nextval('shop_warranty_claim_seq')::TEXT, 4, '0');
END; $$;
REVOKE ALL ON FUNCTION shop_generate_warranty_claim_number() FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_generate_warranty_claim_number() TO authenticated, service_role;

-- Atomic warranty-out: ships DAMAGED stock, opens a claim, appends the movement
-- and recomputes — in one transaction. Returns {claim_id, claim_number, movement_id}.
CREATE OR REPLACE FUNCTION shop_record_warranty_out(
  p_variant uuid, p_location uuid, p_qty int,
  p_reason text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_supplier_name text DEFAULT NULL, p_claim_number text DEFAULT NULL,
  p_photo_url text DEFAULT NULL, p_unit_cost numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_available int; v_claim_id uuid; v_claim_number text; v_movement uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  SELECT (quantity_on_hand - quantity_reserved) INTO v_available
  FROM shop_stock_levels
  WHERE variant_id = p_variant AND location_id = p_location AND condition = 'damaged' FOR UPDATE;
  v_available := COALESCE(v_available, 0);
  IF p_qty > v_available THEN
    RAISE EXCEPTION 'insufficient_damaged_stock: available % < requested %', v_available, p_qty;
  END IF;

  v_claim_number := NULLIF(btrim(coalesce(p_claim_number, '')), '');
  IF v_claim_number IS NULL THEN
    v_claim_number := shop_generate_warranty_claim_number();
  END IF;

  INSERT INTO shop_warranty_claims(claim_number, supplier_name, status, sent_at)
  VALUES (v_claim_number, NULLIF(btrim(coalesce(p_supplier_name, '')), ''), 'sent', NOW())
  RETURNING claim_id INTO v_claim_id;

  INSERT INTO shop_stock_movements(
    variant_id, location_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, reason_code, notes,
    item_condition, photo_url, warranty_claim_number, performed_by)
  VALUES (
    p_variant, p_location, 'warranty_out', p_qty, p_unit_cost,
    'warranty_claim', v_claim_id, p_reason, p_notes,
    'damaged', p_photo_url, v_claim_number, auth.uid())
  RETURNING movement_id INTO v_movement;

  PERFORM shop_recompute_level(p_variant, p_location);
  RETURN jsonb_build_object('claim_id', v_claim_id, 'claim_number', v_claim_number, 'movement_id', v_movement);
END; $$;
REVOKE ALL ON FUNCTION shop_record_warranty_out(uuid,uuid,int,text,text,text,text,text,numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_record_warranty_out(uuid,uuid,int,text,text,text,text,text,numeric) TO authenticated, service_role;

-- shop_record_movement now counts warranty_out as outbound too (the dedicated
-- recorder above is the real path; this keeps the generic recorder's stock check
-- correct if warranty_out is ever routed through it). Signature unchanged.
-- MIGRATION (2026-07 audit fix M2): also stamps performed_by = auth.uid() on the
-- ledger row so every new movement records WHO made it (NULL under service-role
-- / system calls — performed_by has no FK, so that is safe). Transfers and CENTR
-- imports go through this function, so they inherit the actor automatically.
CREATE OR REPLACE FUNCTION shop_record_movement(
  p_variant uuid, p_location uuid, p_type text, p_qty int,
  p_unit_cost numeric DEFAULT NULL, p_reference_type text DEFAULT 'manual',
  p_sales_channel text DEFAULT NULL, p_marketplace_order text DEFAULT NULL,
  p_reason text DEFAULT NULL, p_notes text DEFAULT NULL, p_allow_backorder boolean DEFAULT false,
  p_item_condition text DEFAULT 'good', p_photo_url text DEFAULT NULL, p_reference_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_available int;
  v_outbound boolean := p_type IN ('sale','transfer_out','return_out','adjustment_out','write_off','damage_out','warranty_out');
  v_movement uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity: quantity must be positive'; END IF;
  IF v_outbound AND NOT p_allow_backorder THEN
    SELECT (quantity_on_hand - quantity_reserved) INTO v_available FROM shop_stock_levels
    WHERE variant_id = p_variant AND location_id = p_location AND condition = p_item_condition FOR UPDATE;
    v_available := COALESCE(v_available, 0);
    IF p_qty > v_available THEN RAISE EXCEPTION 'insufficient_stock: available % < requested %', v_available, p_qty; END IF;
  END IF;
  INSERT INTO shop_stock_movements(variant_id, location_id, movement_type, quantity, unit_cost,
    reference_type, sales_channel, marketplace_order_number, reason_code, notes, item_condition, photo_url, reference_number, performed_by)
  VALUES (p_variant, p_location, p_type, p_qty, p_unit_cost, p_reference_type, p_sales_channel,
    p_marketplace_order, p_reason, p_notes, p_item_condition, p_photo_url, p_reference_number, auth.uid())
  RETURNING movement_id INTO v_movement;
  PERFORM shop_recompute_level(p_variant, p_location);
  RETURN v_movement;
END; $$;
REVOKE ALL ON FUNCTION shop_record_movement(uuid,uuid,text,int,numeric,text,text,text,text,text,boolean,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_record_movement(uuid,uuid,text,int,numeric,text,text,text,text,text,boolean,text,text,text) TO authenticated, service_role;

-- ============================================================================
-- MIGRATION (2026-07): Activity log — who changed what, and when.
-- Database triggers populate shop_audit_logs automatically for every important
-- table. The actor is read from the request JWT, so no frontend change is
-- needed beyond the read-only Activity Log page. Applied to the live DB; kept
-- here idempotently.
-- ============================================================================

ALTER TABLE shop_audit_logs
  ADD COLUMN IF NOT EXISTS user_email  TEXT,
  ADD COLUMN IF NOT EXISTS user_name   TEXT,
  ADD COLUMN IF NOT EXISTS module      TEXT,   -- 'barang_masuk' | 'barang_keluar' | 'pengaturan' | ...
  ADD COLUMN IF NOT EXISTS description TEXT,   -- human-readable, e.g. "Update harga KB-016"
  ADD COLUMN IF NOT EXISTS session_id  TEXT;

CREATE INDEX IF NOT EXISTS idx_shop_audit_logs_user    ON shop_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_audit_logs_entity  ON shop_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_shop_audit_logs_action  ON shop_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_shop_audit_logs_created ON shop_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_audit_logs_module  ON shop_audit_logs(module);

-- Read-only for authenticated users; inserts happen only via the SECURITY DEFINER
-- logger below, so logs cannot be forged from the client.
ALTER TABLE shop_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_audit_logs_read ON shop_audit_logs;
CREATE POLICY shop_audit_logs_read ON shop_audit_logs FOR SELECT TO authenticated USING (true);
GRANT SELECT ON shop_audit_logs TO authenticated;

-- Central logger — actor comes from the request JWT (auth.uid()/auth.jwt()); an
-- audit failure never breaks the underlying operation.
CREATE OR REPLACE FUNCTION shop_log_audit_event(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_before jsonb, p_after jsonb,
  p_module text DEFAULT NULL, p_description text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_email text; v_name text; v_session text;
BEGIN
  BEGIN
    v_uid := auth.uid();
    v_email := auth.jwt() ->> 'email';
    v_name := COALESCE(auth.jwt() -> 'user_metadata' ->> 'full_name', v_email);
    v_session := auth.jwt() ->> 'session_id';
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL; v_email := NULL; v_name := NULL; v_session := NULL;
  END;
  INSERT INTO shop_audit_logs(
    user_id, user_email, user_name, action, entity_type, entity_id,
    before_value, after_value, module, description, session_id, created_at)
  VALUES (
    v_uid, v_email, COALESCE(v_name, 'System'), p_action, p_entity_type, p_entity_id,
    p_before, p_after, p_module, p_description, v_session, NOW());
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'audit log failed for % % %: %', p_action, p_entity_type, p_entity_id, SQLERRM;
END; $$;
REVOKE ALL ON FUNCTION shop_log_audit_event(text,text,uuid,jsonb,jsonb,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_log_audit_event(text,text,uuid,jsonb,jsonb,text,text) TO authenticated, service_role;

-- Per-table audit triggers (all SECURITY DEFINER).
CREATE OR REPLACE FUNCTION shop_audit_product_variants()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_desc := 'SKU baru dibuat: ' || NEW.sku_code;
    PERFORM shop_log_audit_event('sku_created','shop_product_variants',NEW.variant_id,NULL,to_jsonb(NEW),'pengaturan',v_desc);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.cost_price IS DISTINCT FROM NEW.cost_price OR OLD.selling_price IS DISTINCT FROM NEW.selling_price THEN
      v_desc := 'Update harga ' || NEW.sku_code
        || ': modal ' || COALESCE(OLD.cost_price::TEXT,'-') || ' → ' || COALESCE(NEW.cost_price::TEXT,'-')
        || ', jual ' || COALESCE(OLD.selling_price::TEXT,'-') || ' → ' || COALESCE(NEW.selling_price::TEXT,'-');
    ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      v_desc := 'SKU ' || NEW.sku_code || (CASE WHEN NEW.is_active THEN ' diaktifkan' ELSE ' dinonaktifkan' END);
    ELSE
      v_desc := 'Update data SKU: ' || NEW.sku_code;
    END IF;
    PERFORM shop_log_audit_event('sku_updated','shop_product_variants',NEW.variant_id,to_jsonb(OLD),to_jsonb(NEW),'pengaturan',v_desc);
  ELSIF TG_OP = 'DELETE' THEN
    v_desc := 'SKU dihapus: ' || OLD.sku_code;
    PERFORM shop_log_audit_event('sku_deleted','shop_product_variants',OLD.variant_id,to_jsonb(OLD),NULL,'pengaturan',v_desc);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_product_variants ON shop_product_variants;
CREATE TRIGGER trg_shop_audit_product_variants
  AFTER INSERT OR UPDATE OR DELETE ON shop_product_variants
  FOR EACH ROW EXECUTE FUNCTION shop_audit_product_variants();

CREATE OR REPLACE FUNCTION shop_audit_products()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_desc := 'Produk baru: ' || NEW.name;
    PERFORM shop_log_audit_event('product_created','shop_products',NEW.product_id,NULL,to_jsonb(NEW),'pengaturan',v_desc);
  ELSIF TG_OP = 'UPDATE' THEN
    v_desc := 'Update produk: ' || NEW.name;
    PERFORM shop_log_audit_event('product_updated','shop_products',NEW.product_id,to_jsonb(OLD),to_jsonb(NEW),'pengaturan',v_desc);
  ELSIF TG_OP = 'DELETE' THEN
    v_desc := 'Produk dihapus: ' || OLD.name;
    PERFORM shop_log_audit_event('product_deleted','shop_products',OLD.product_id,to_jsonb(OLD),NULL,'pengaturan',v_desc);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_products ON shop_products;
CREATE TRIGGER trg_shop_audit_products
  AFTER INSERT OR UPDATE OR DELETE ON shop_products
  FOR EACH ROW EXECUTE FUNCTION shop_audit_products();

-- stock_movements is append-only → INSERT only.
CREATE OR REPLACE FUNCTION shop_audit_stock_movements()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sku TEXT; v_desc TEXT; v_module TEXT;
BEGIN
  SELECT sku_code INTO v_sku FROM shop_product_variants WHERE variant_id = NEW.variant_id;
  v_module := CASE
    WHEN NEW.movement_type IN ('purchase_receipt','damage_in','return_in','return_in_damaged') THEN 'barang_masuk'
    WHEN NEW.movement_type IN ('sale','damage_out','warranty_out','return_out') THEN 'barang_keluar'
    WHEN NEW.movement_type IN ('transfer_in','transfer_out') THEN 'transfer'
    WHEN NEW.movement_type IN ('adjustment_in','adjustment_out') THEN 'stock_opname'
    ELSE 'mutasi_stok'
  END;
  v_desc := CASE NEW.movement_type
    WHEN 'purchase_receipt'  THEN 'Terima barang: '
    WHEN 'sale'              THEN 'Penjualan: '
    WHEN 'return_in'         THEN 'Retur masuk (baik): '
    WHEN 'return_in_damaged' THEN 'Retur masuk (rusak): '
    WHEN 'damage_in'         THEN 'Catat barang rusak masuk: '
    WHEN 'damage_out'        THEN 'Disposal barang rusak: '
    WHEN 'warranty_out'      THEN 'Kirim garansi: '
    WHEN 'transfer_in'       THEN 'Transfer masuk: '
    WHEN 'transfer_out'      THEN 'Transfer keluar: '
    WHEN 'adjustment_in'     THEN 'Penyesuaian stok (+): '
    WHEN 'adjustment_out'    THEN 'Penyesuaian stok (-): '
    WHEN 'write_off'         THEN 'Write-off stok: '
    ELSE NEW.movement_type || ': '
  END || NEW.quantity || ' × ' || COALESCE(v_sku, '?');
  IF NEW.reference_number IS NOT NULL THEN
    v_desc := v_desc || ' [' || NEW.reference_number || ']';
  END IF;
  PERFORM shop_log_audit_event('stock_' || NEW.movement_type,'shop_stock_movements',NEW.movement_id,NULL,to_jsonb(NEW),v_module,v_desc);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_stock_movements ON shop_stock_movements;
CREATE TRIGGER trg_shop_audit_stock_movements
  AFTER INSERT ON shop_stock_movements
  FOR EACH ROW EXECUTE FUNCTION shop_audit_stock_movements();

CREATE OR REPLACE FUNCTION shop_audit_purchase_orders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_desc := 'PO dibuat: ' || NEW.po_number;
    PERFORM shop_log_audit_event('po_created','shop_purchase_orders',NEW.po_id,NULL,to_jsonb(NEW),'barang_masuk',v_desc);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_desc := 'Status PO ' || NEW.po_number || ': ' || OLD.status || ' → ' || NEW.status;
    ELSE
      v_desc := 'Update PO: ' || NEW.po_number;
    END IF;
    PERFORM shop_log_audit_event('po_updated','shop_purchase_orders',NEW.po_id,to_jsonb(OLD),to_jsonb(NEW),'barang_masuk',v_desc);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_purchase_orders ON shop_purchase_orders;
CREATE TRIGGER trg_shop_audit_purchase_orders
  AFTER INSERT OR UPDATE ON shop_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION shop_audit_purchase_orders();

CREATE OR REPLACE FUNCTION shop_audit_stock_opname()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_desc := 'Sesi stock opname dibuat';
    PERFORM shop_log_audit_event('opname_created','shop_stock_opname_sessions',NEW.session_id,NULL,to_jsonb(NEW),'stock_opname',v_desc);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_desc := 'Status opname: ' || OLD.status || ' → ' || NEW.status;
      IF NEW.status = 'completed' THEN v_desc := v_desc || ' (disetujui)'; END IF;
    ELSE
      v_desc := 'Update sesi opname';
    END IF;
    PERFORM shop_log_audit_event('opname_updated','shop_stock_opname_sessions',NEW.session_id,to_jsonb(OLD),to_jsonb(NEW),'stock_opname',v_desc);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_stock_opname_sessions ON shop_stock_opname_sessions;
CREATE TRIGGER trg_shop_audit_stock_opname_sessions
  AFTER INSERT OR UPDATE ON shop_stock_opname_sessions
  FOR EACH ROW EXECUTE FUNCTION shop_audit_stock_opname();

CREATE OR REPLACE FUNCTION shop_audit_warranty_claims()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_desc := 'Klaim garansi dibuat: ' || NEW.claim_number || ' → ' || COALESCE(NEW.supplier_name,'?');
    PERFORM shop_log_audit_event('warranty_created','shop_warranty_claims',NEW.claim_id,NULL,to_jsonb(NEW),'barang_keluar',v_desc);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_desc := 'Status klaim ' || NEW.claim_number || ': ' || OLD.status || ' → ' || NEW.status;
    ELSE
      v_desc := 'Update klaim garansi: ' || NEW.claim_number;
    END IF;
    PERFORM shop_log_audit_event('warranty_updated','shop_warranty_claims',NEW.claim_id,to_jsonb(OLD),to_jsonb(NEW),'barang_keluar',v_desc);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_warranty_claims ON shop_warranty_claims;
CREATE TRIGGER trg_shop_audit_warranty_claims
  AFTER INSERT OR UPDATE ON shop_warranty_claims
  FOR EACH ROW EXECUTE FUNCTION shop_audit_warranty_claims();

CREATE OR REPLACE FUNCTION shop_audit_sales_staff()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_desc := 'Tambah sales staff: ' || NEW.name;
    PERFORM shop_log_audit_event('staff_created','shop_sales_staff',NEW.staff_id,NULL,to_jsonb(NEW),'pengaturan',v_desc);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.name IS DISTINCT FROM NEW.name THEN
      v_desc := 'Nama sales diubah: ' || OLD.name || ' → ' || NEW.name;
    ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      v_desc := 'Sales staff ' || NEW.name || (CASE WHEN NEW.is_active THEN ' diaktifkan' ELSE ' dinonaktifkan' END);
    ELSE
      v_desc := 'Update sales staff: ' || NEW.name;
    END IF;
    PERFORM shop_log_audit_event('staff_updated','shop_sales_staff',NEW.staff_id,to_jsonb(OLD),to_jsonb(NEW),'pengaturan',v_desc);
  ELSIF TG_OP = 'DELETE' THEN
    v_desc := 'Sales staff dihapus: ' || OLD.name;
    PERFORM shop_log_audit_event('staff_deleted','shop_sales_staff',OLD.staff_id,to_jsonb(OLD),NULL,'pengaturan',v_desc);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_sales_staff ON shop_sales_staff;
CREATE TRIGGER trg_shop_audit_sales_staff
  AFTER INSERT OR UPDATE OR DELETE ON shop_sales_staff
  FOR EACH ROW EXECUTE FUNCTION shop_audit_sales_staff();

-- Master data (locations / brands / categories).
CREATE OR REPLACE FUNCTION shop_audit_locations()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT;
BEGIN
  v_desc := CASE TG_OP
    WHEN 'INSERT' THEN 'Lokasi baru: ' || NEW.name
    WHEN 'UPDATE' THEN 'Update lokasi: ' || NEW.name
    WHEN 'DELETE' THEN 'Lokasi dihapus: ' || OLD.name END;
  PERFORM shop_log_audit_event('location_' || LOWER(TG_OP),'shop_locations',
    COALESCE(NEW.location_id, OLD.location_id),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
    'pengaturan', v_desc);
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_locations ON shop_locations;
CREATE TRIGGER trg_shop_audit_locations
  AFTER INSERT OR UPDATE OR DELETE ON shop_locations
  FOR EACH ROW EXECUTE FUNCTION shop_audit_locations();

CREATE OR REPLACE FUNCTION shop_audit_brands()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT;
BEGIN
  v_desc := CASE TG_OP
    WHEN 'INSERT' THEN 'Brand baru: ' || NEW.name
    WHEN 'UPDATE' THEN 'Update brand: ' || NEW.name
    WHEN 'DELETE' THEN 'Brand dihapus: ' || OLD.name END;
  PERFORM shop_log_audit_event('brand_' || LOWER(TG_OP),'shop_brands',
    COALESCE(NEW.brand_id, OLD.brand_id),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
    'pengaturan', v_desc);
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_brands ON shop_brands;
CREATE TRIGGER trg_shop_audit_brands
  AFTER INSERT OR UPDATE OR DELETE ON shop_brands
  FOR EACH ROW EXECUTE FUNCTION shop_audit_brands();

CREATE OR REPLACE FUNCTION shop_audit_categories()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desc TEXT;
BEGIN
  v_desc := CASE TG_OP
    WHEN 'INSERT' THEN 'Kategori baru: ' || NEW.name
    WHEN 'UPDATE' THEN 'Update kategori: ' || NEW.name
    WHEN 'DELETE' THEN 'Kategori dihapus: ' || OLD.name END;
  PERFORM shop_log_audit_event('category_' || LOWER(TG_OP),'shop_categories',
    COALESCE(NEW.category_id, OLD.category_id),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
    'pengaturan', v_desc);
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_shop_audit_categories ON shop_categories;
CREATE TRIGGER trg_shop_audit_categories
  AFTER INSERT OR UPDATE OR DELETE ON shop_categories
  FOR EACH ROW EXECUTE FUNCTION shop_audit_categories();

-- ============================================================================
-- MIGRATION (2026-07): Import CENTR Sales Order as bulk Goods In.
-- CENTR (Health In Motion) supplier item codes (e.g. "2-HUOKB16-54484") differ
-- from 20FIT SKUs, so a mapping table resolves them. The parsed SO is recorded
-- as purchase_receipt goods-in; USD prices are kept in notes (Finance converts
-- to IDR later). Applied to the live DB; kept here idempotently. The 36 seed
-- rows are re-created from the live SKU list on a fresh provision.
-- ============================================================================

CREATE TABLE IF NOT EXISTS shop_centr_item_mappings (
  mapping_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  centr_item_code TEXT NOT NULL UNIQUE,   -- e.g. "2-HUOKB16-54484"
  centr_item_name TEXT,
  variant_id      UUID REFERENCES shop_product_variants(variant_id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shop_centr_item_code ON shop_centr_item_mappings(centr_item_code);
ALTER TABLE shop_centr_item_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_centr_mappings_read ON shop_centr_item_mappings;
CREATE POLICY shop_centr_mappings_read ON shop_centr_item_mappings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS shop_centr_mappings_write ON shop_centr_item_mappings;
CREATE POLICY shop_centr_mappings_write ON shop_centr_item_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_centr_item_mappings TO authenticated;

-- Seed the known CENTR code → SKU mappings (only where the SKU exists).
INSERT INTO shop_centr_item_mappings (centr_item_code, centr_item_name, variant_id)
SELECT m.code, m.name, v.variant_id
FROM (VALUES
  ('54752 NMT.3.0','HYROX/ CENTR Non-Motorized Treadmills','20FIT-TM-001'),
  ('2-HPS-54487','Centr x Hyrox Push Sled 50kg','20FIT-HPS-001'),
  ('2-HBR-54473','Centr x Hyrox Battle Rope','20FIT-HBR-001'),
  ('2-HTURF7-54683','Centr x Hyrox Perform Turf - Middle (2) Lanes 2m x 12.5m','20FIT-TURF-7'),
  ('2-HBT-54497','Centr x Hyrox Wall Ball Target','20FIT-HBT-001'),
  ('2-HUOKB8-54509','Centr x Hyrox Kettlebell 8kg','20FIT-KB-008'),
  ('2-HUOKB12-54510','Centr x Hyrox Kettlebell 12kg','20FIT-KB-012'),
  ('2-HUOKB16-54484','Centr x Hyrox Kettlebell 16kg','20FIT-KB-016'),
  ('2-HUOKB20-54511','Centr x Hyrox Kettlebell 20kg','20FIT-KB-020'),
  ('2-HUOKB24-54485','Centr x Hyrox Kettlebell 24kg','20FIT-KB-024'),
  ('2-HUOKB28-54512','Centr x Hyrox Kettlebell 28kg','20FIT-KB-028'),
  ('2-HUOKB32-54486','Centr x Hyrox Kettlebell 32kg','20FIT-KB-032'),
  ('2-HSB10-54478','Centr x Hyrox Sandbag 10kg','20FIT-HSB10-001'),
  ('2-HSB20-54479','Centr x Hyrox Sandbag 20kg','20FIT-HSB20-001'),
  ('2-HSB30-54480','Centr x Hyrox Sandbag 30kg','20FIT-HSB30-001'),
  ('2-HUBP5-54630','Centr x Hyrox Plate Weights (5kg)','20FIT-BP-005'),
  ('2-HUBP10-54474','Hyrox CPU Bumper Plate, 10KG','20FIT-BP-010'),
  ('2-HUBP15-54475','Hyrox CPU Bumper Plate, 15KG','20FIT-BP-015'),
  ('2-HUBP20-54476','Hyrox CPU Bumper Plate, 20KG','20FIT-BP-020'),
  ('2-HUBP25-54477','Centr x Hyrox Plate Weight 25kg','20FIT-BP-025'),
  ('2-HUTP2-54560','Centr x Hyrox Top Plate Weight 2kg','20FIT-TP-002'),
  ('2-HUTP3-54561','Centr x Hyrox Top Plate Weight 3kg','20FIT-TP-003'),
  ('2-HWB2-54491','Centr x Hyrox Wall Ball 2kg','20FIT-HWB2-001'),
  ('2-HWB4-54481','Centr x Hyrox Wall Ball 4kg','20FIT-HWB4-001'),
  ('2-HWB6-54482','Centr x Hyrox Wall Ball 6kg','20FIT-HWB6-001'),
  ('2-HWB9-54483','Centr x Hyrox Wall Ball 9kg','20FIT-HWB9-001'),
  ('2-HWB12-54553','Centr x Hyrox Wall Ball 12kg','20FIT-HWB12-001'),
  ('2-HUODB5-54513','Centr x Hyrox Dumbbell 5kg','20FIT-DB-005'),
  ('2-HUODB7.5-54514','Centr x Hyrox Dumbbell 7.5kg','20FIT-DB-0075'),
  ('2-HUODB10-54515','Centr x Hyrox Dumbbell 10kg','20FIT-DB-010'),
  ('2-HUODB12.5-54516','Centr x Hyrox Dumbbell 12.5kg','20FIT-DB-0125'),
  ('2-HUODB15-54517','Centr x Hyrox Dumbbell 15kg','20FIT-DB-015'),
  ('2-HUODB17.5-54518','Centr x Hyrox Dumbbell 17.5kg','20FIT-DB-0175'),
  ('2-HUODB20-54519','Centr x Hyrox Dumbbell 20kg','20FIT-DB-020'),
  ('2-HUODB22.5-54520','Centr x Hyrox Dumbbell 22.5kg','20FIT-DB-0225'),
  ('2-HUODB25-54521','Centr x Hyrox Dumbbell 25kg','20FIT-DB-025')
) AS m(code, name, sku)
JOIN shop_product_variants v ON v.sku_code = m.sku
ON CONFLICT (centr_item_code) DO NOTHING;

-- Atomic bulk goods-in from a CENTR Sales Order: purchase_receipt per item
-- (good condition), SO number in reference_number, USD price kept in notes.
-- unit_cost stays NULL — USD→IDR conversion is done later by Finance.
CREATE OR REPLACE FUNCTION shop_import_centr_so(
  p_location uuid, p_reference text, p_items jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb; v_count int := 0; v_variant uuid;
BEGIN
  IF p_location IS NULL THEN RAISE EXCEPTION 'invalid_location'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'invalid_items'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant := (v_item->>'variant_id')::uuid;
    IF v_variant IS NULL THEN CONTINUE; END IF;
    PERFORM shop_record_movement(
      v_variant, p_location, 'purchase_receipt',
      (v_item->>'quantity')::int, NULL,
      'centr_sales_order', NULL, NULL, NULL,
      NULLIF(v_item->>'notes',''), false, 'good', NULL,
      NULLIF(btrim(coalesce(p_reference,'')),''));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION shop_import_centr_so(uuid,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION shop_import_centr_so(uuid,text,jsonb) TO authenticated, service_role;

-- ============================================================================
-- MIGRATION (2026-07): OTP password reset (branded, provider-independent).
-- Replaces the Supabase magic-link recovery email (which carried another app's
-- branding in this shared project) with a 6-digit code the app emails itself.
-- Applied to the live DB; kept here idempotently.
-- ============================================================================

CREATE TABLE IF NOT EXISTS shop_password_reset_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,            -- bcrypt hash of the 6-digit code (never plaintext)
  used        BOOLEAN NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ NOT NULL,     -- now() + 10 min
  attempts    INTEGER NOT NULL DEFAULT 0,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_otp_email ON shop_password_reset_otps(email, used, expires_at);

-- Service-role only: RLS on + zero policies denies anon/authenticated entirely;
-- the server actions reach it with the service-role key (which bypasses RLS).
ALTER TABLE shop_password_reset_otps ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION shop_cleanup_expired_otps() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM shop_password_reset_otps WHERE expires_at < now() - INTERVAL '1 hour';
$$;
REVOKE ALL ON FUNCTION shop_cleanup_expired_otps() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION shop_cleanup_expired_otps() TO service_role;

-- auth.admin.listUsers() only returns the first page, so the OTP flow resolves
-- the target account by email through this indexed lookup. Service-role only.
CREATE OR REPLACE FUNCTION shop_find_auth_user_by_email(p_email text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION shop_find_auth_user_by_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION shop_find_auth_user_by_email(text) TO service_role;

-- ============================================================================
-- MIGRATION (2026-07): Per-IP throttle for OTP password-reset requests.
-- A second layer over the per-email throttle: every reset request is logged by
-- caller IP so requestPasswordOtp can cap requests per IP per 15-min window,
-- independent of whether the target account exists. Service-role only, matching
-- shop_password_reset_otps. Applied to the live DB; kept here idempotently.
-- ============================================================================

CREATE TABLE IF NOT EXISTS shop_otp_ip_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_otp_ip ON shop_otp_ip_requests(ip_address, created_at);

-- Service-role only: RLS on + zero policies denies anon/authenticated entirely.
ALTER TABLE shop_otp_ip_requests ENABLE ROW LEVEL SECURITY;

-- Supersedes the earlier definition to also prune the IP-request log (same
-- 1-hour retention, well past the 15-min rate-limit window).
CREATE OR REPLACE FUNCTION shop_cleanup_expired_otps() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM shop_password_reset_otps WHERE expires_at < now() - INTERVAL '1 hour';
  DELETE FROM shop_otp_ip_requests     WHERE created_at < now() - INTERVAL '1 hour';
$$;
REVOKE ALL ON FUNCTION shop_cleanup_expired_otps() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION shop_cleanup_expired_otps() TO service_role;

-- ============================================================================
-- MIGRATION (2026-07): Stamp performed_by on the 3 ledger paths that left it
-- NULL, so the audit trail records "who" for every stock movement. These
-- SECURITY DEFINER functions run in the same context as shop_record_movement
-- (which already populates performed_by = auth.uid()). Applied to the live DB;
-- kept here idempotently. NOTE: these definitions reflect the live functions,
-- which have drifted from the original defs earlier in this file (extra params
-- item_condition/photo_url/sales_staff_id/dw_name, condition = 'good', etc.);
-- the CREATE OR REPLACE statements below supersede those.
-- ============================================================================

-- Transfer: performed_by on BOTH transfer_out and transfer_in (sales_staff_id /
-- dw_name retained — both identities kept).
CREATE OR REPLACE FUNCTION public.shop_record_transfer(
  p_variant uuid, p_from uuid, p_to uuid, p_qty integer,
  p_notes text DEFAULT NULL::text, p_allow_backorder boolean DEFAULT false,
  p_sales_staff_id uuid DEFAULT NULL::uuid, p_dw_name text DEFAULT NULL::text,
  p_photo_url text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_available int; v_ref uuid := gen_random_uuid();
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'same_location'; END IF;
  IF NOT p_allow_backorder THEN
    SELECT (quantity_on_hand - quantity_reserved) INTO v_available
    FROM shop_stock_levels WHERE variant_id = p_variant AND location_id = p_from AND condition = 'good' FOR UPDATE;
    v_available := COALESCE(v_available, 0);
    IF p_qty > v_available THEN RAISE EXCEPTION 'insufficient_stock: available % < requested %', v_available, p_qty; END IF;
  END IF;
  INSERT INTO shop_stock_movements(variant_id, location_id, related_location_id, movement_type, quantity, reference_type, reference_id, notes, sales_staff_id, dw_name, photo_url, performed_by)
  VALUES (p_variant, p_from, p_to, 'transfer_out', p_qty, 'transfer_order', v_ref, p_notes, p_sales_staff_id, p_dw_name, p_photo_url, auth.uid());
  INSERT INTO shop_stock_movements(variant_id, location_id, related_location_id, movement_type, quantity, reference_type, reference_id, notes, sales_staff_id, dw_name, photo_url, performed_by)
  VALUES (p_variant, p_to, p_from, 'transfer_in', p_qty, 'transfer_order', v_ref, p_notes, p_sales_staff_id, p_dw_name, p_photo_url, auth.uid());
  PERFORM shop_recompute_level(p_variant, p_from);
  PERFORM shop_recompute_level(p_variant, p_to);
  RETURN v_ref;
END; $function$;

-- Xero import: performed_by on the direct INSERT.
CREATE OR REPLACE FUNCTION public.shop_import_xero_sale(
  p_location uuid, p_reference text, p_customer text, p_items jsonb, p_allow_backorder boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_item jsonb; v_count int := 0; v_variant uuid; v_qty int; v_desc text; v_available int; v_note text;
BEGIN
  IF p_location IS NULL THEN RAISE EXCEPTION 'invalid_location'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'invalid_items'; END IF;
  v_note := NULLIF(btrim(coalesce(p_customer, '')), '');
  v_note := btrim(concat_ws(' — ', v_note, 'Import dari Xero'));
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant := (v_item->>'variant_id')::uuid; v_qty := (v_item->>'quantity')::int; v_desc := v_item->>'description';
    IF v_variant IS NULL THEN RAISE EXCEPTION 'invalid_variant'; END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
    IF NOT p_allow_backorder THEN
      SELECT (quantity_on_hand - quantity_reserved) INTO v_available
      FROM shop_stock_levels WHERE variant_id = v_variant AND location_id = p_location AND condition = 'good' FOR UPDATE;
      v_available := COALESCE(v_available, 0);
      IF v_qty > v_available THEN RAISE EXCEPTION 'insufficient_stock: "%" available % < requested %', coalesce(v_desc, ''), v_available, v_qty; END IF;
    END IF;
    INSERT INTO shop_stock_movements(variant_id, location_id, movement_type, quantity, reference_type, reference_number, sales_channel, notes, performed_by)
    VALUES (v_variant, p_location, 'sale', v_qty, 'xero_quotation', NULLIF(btrim(coalesce(p_reference,'')), ''), 'b2b_direct', v_note, auth.uid());
    PERFORM shop_recompute_level(v_variant, p_location);
    IF v_desc IS NOT NULL AND length(btrim(v_desc)) > 0 THEN
      INSERT INTO shop_xero_product_mappings(xero_description, variant_id) VALUES (btrim(v_desc), v_variant)
      ON CONFLICT (xero_description) DO UPDATE SET variant_id = EXCLUDED.variant_id, updated_at = NOW();
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;

-- Opname apply: performed_by on the adjustment ledger rows (session approved_by
-- unchanged).
CREATE OR REPLACE FUNCTION public.shop_apply_opname(p_session uuid, p_user uuid DEFAULT NULL::uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
      INSERT INTO shop_stock_movements(variant_id, location_id, movement_type, quantity, reference_type, reference_id, reason_code, notes, performed_by)
      VALUES (r.variant_id, v_loc, v_type, abs(v_diff), 'adjustment', p_session, 'stock_opname', 'Penyesuaian hasil stock opname', auth.uid());
      PERFORM shop_recompute_level(r.variant_id, v_loc);
      v_count := v_count + 1;
    END IF;
    UPDATE shop_stock_opname_lines SET is_approved = true WHERE line_id = r.line_id;
  END LOOP;
  UPDATE shop_stock_opname_sessions SET status = 'completed', completed_at = NOW(), approved_by = p_user WHERE session_id = p_session;
  RETURN v_count;
END; $function$;

-- Actor lookup for the Mutasi "By" column + user filter. The authed PostgREST
-- client cannot read auth.users, so expose a minimal SECURITY DEFINER helper —
-- scoped to ONLY users who have performed a movement (this is a SHARED project
-- whose auth.users holds the whole 20FIT ecosystem, so we must not expose all of
-- it). Also returns a display name resolved from the shop's own staff row
-- (nickname > full_name > email); see the Phase 1 migration block below for the
-- current definition (this base one is kept for historical context and is
-- superseded by the DROP/CREATE further down).
CREATE OR REPLACE FUNCTION public.shop_movement_actors()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT u.id, u.email
  FROM auth.users u
  WHERE u.id IN (
    SELECT DISTINCT performed_by FROM shop_stock_movements WHERE performed_by IS NOT NULL
  )
$function$;
REVOKE ALL ON FUNCTION public.shop_movement_actors() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shop_movement_actors() TO authenticated, service_role;

-- ============================================================================
-- MIGRATION (2026-07): Duplicate-prevention for the referenced import paths.
-- Re-importing the same quotation/SO reference silently inserted a second
-- identical batch (real stock double-decrement). Each import now takes a
-- transaction advisory lock on the reference (race-safe without a schema
-- constraint) and raises duplicate_reference — including the original import
-- date — if any row already exists for that reference (scoped by
-- reference_type). Skipped entirely when no reference is provided (deliberate
-- scope limitation). Applied to the live DB; kept here idempotently.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.shop_import_xero_sale(
  p_location uuid, p_reference text, p_customer text, p_items jsonb, p_allow_backorder boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_item jsonb; v_count int := 0; v_variant uuid; v_qty int; v_desc text; v_available int; v_note text;
  v_ref text := NULLIF(btrim(coalesce(p_reference, '')), '');
  v_dup_date date;
BEGIN
  IF p_location IS NULL THEN RAISE EXCEPTION 'invalid_location'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'invalid_items'; END IF;

  -- Duplicate-prevention (only when a reference is present).
  IF v_ref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('xero_import:' || v_ref, 0));
    SELECT min(performed_at)::date INTO v_dup_date
    FROM shop_stock_movements
    WHERE reference_type = 'xero_quotation' AND reference_number = v_ref;
    IF v_dup_date IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_reference: %', v_dup_date;
    END IF;
  END IF;

  v_note := NULLIF(btrim(coalesce(p_customer, '')), '');
  v_note := btrim(concat_ws(' — ', v_note, 'Import dari Xero'));
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant := (v_item->>'variant_id')::uuid; v_qty := (v_item->>'quantity')::int; v_desc := v_item->>'description';
    IF v_variant IS NULL THEN RAISE EXCEPTION 'invalid_variant'; END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
    IF NOT p_allow_backorder THEN
      SELECT (quantity_on_hand - quantity_reserved) INTO v_available
      FROM shop_stock_levels WHERE variant_id = v_variant AND location_id = p_location AND condition = 'good' FOR UPDATE;
      v_available := COALESCE(v_available, 0);
      IF v_qty > v_available THEN RAISE EXCEPTION 'insufficient_stock: "%" available % < requested %', coalesce(v_desc, ''), v_available, v_qty; END IF;
    END IF;
    INSERT INTO shop_stock_movements(variant_id, location_id, movement_type, quantity, reference_type, reference_number, sales_channel, notes, performed_by)
    VALUES (v_variant, p_location, 'sale', v_qty, 'xero_quotation', v_ref, 'b2b_direct', v_note, auth.uid());
    PERFORM shop_recompute_level(v_variant, p_location);
    IF v_desc IS NOT NULL AND length(btrim(v_desc)) > 0 THEN
      INSERT INTO shop_xero_product_mappings(xero_description, variant_id) VALUES (btrim(v_desc), v_variant)
      ON CONFLICT (xero_description) DO UPDATE SET variant_id = EXCLUDED.variant_id, updated_at = NOW();
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;

CREATE OR REPLACE FUNCTION public.shop_import_centr_so(p_location uuid, p_reference text, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_item jsonb; v_count int := 0; v_variant uuid;
  v_ref text := NULLIF(btrim(coalesce(p_reference, '')), '');
  v_dup_date date;
BEGIN
  IF p_location IS NULL THEN RAISE EXCEPTION 'invalid_location'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'invalid_items'; END IF;

  -- Duplicate-prevention (only when a reference is present).
  IF v_ref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('centr_import:' || v_ref, 0));
    SELECT min(performed_at)::date INTO v_dup_date
    FROM shop_stock_movements
    WHERE reference_type = 'centr_sales_order' AND reference_number = v_ref;
    IF v_dup_date IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_reference: %', v_dup_date;
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant := (v_item->>'variant_id')::uuid;
    IF v_variant IS NULL THEN CONTINUE; END IF;
    PERFORM shop_record_movement(
      v_variant, p_location, 'purchase_receipt',
      (v_item->>'quantity')::int, NULL,
      'centr_sales_order', NULL, NULL, NULL,
      NULLIF(v_item->>'notes',''), false, 'good', NULL,
      v_ref);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;

-- ============================================================================
-- MIGRATION (2026-07): Link staff records to their login accounts.
-- shop_staff.user_id was unpopulated for some rows, so movement-actor name
-- resolution couldn't use shop_staff (it falls back to auth.users email).
-- Backfill each unlinked staff row from auth.users by EXACT (case-insensitive)
-- email match only — no fuzzy matching — and add a partial unique guard so two
-- staff rows can never point at the same login account. Applied to the live DB;
-- kept here idempotently.
-- ============================================================================

-- Guard first (safe to create before/after the backfill): one login account
-- maps to at most one staff row. Partial so multiple unlinked (NULL) rows coexist.
CREATE UNIQUE INDEX IF NOT EXISTS shop_staff_user_id_key
  ON shop_staff (user_id) WHERE user_id IS NOT NULL;

-- Backfill: exact email match only, and only rows still unlinked (idempotent —
-- a no-op once linked or when no matching auth account exists).
UPDATE shop_staff s
SET user_id = u.id, updated_at = now()
FROM auth.users u
WHERE s.user_id IS NULL
  AND lower(btrim(s.email)) = lower(btrim(u.email));

-- ============================================================================
-- MIGRATION (2026-08): Phase 0 authorization hardening — role vocabulary.
-- Adds ranked 'super_admin' (above admin) and 'pending' (authenticated but
-- authorized for nothing) to the shop_staff role CHECK. App-level authorization
-- now gates on an ACTIVE shop_staff row whose role is at least viewer (see
-- src/lib/roles.ts + src/lib/auth.ts + middleware). Applied to the live DB;
-- kept here idempotently. (The inline CREATE TABLE constraint above already
-- lists all six for fresh provisions; this ALTER updates existing databases.)
-- ============================================================================
ALTER TABLE shop_staff DROP CONSTRAINT IF EXISTS shop_staff_role_chk;
ALTER TABLE shop_staff ADD CONSTRAINT shop_staff_role_chk
  CHECK (role IN ('super_admin','admin','manager','staff','viewer','pending'));

-- Bootstrap the first super_admin (Tifany). Only a super_admin can mint another
-- via the app, so the first one is set here. Guarded by staff_id + email so it
-- only touches that row; idempotent. Applied to the live DB.
UPDATE shop_staff
SET role = 'super_admin', updated_at = now()
WHERE staff_id = '18590fb5-3c37-4996-96aa-2d65bfc123f8'
  AND lower(btrim(email)) = 'tifany@20fit.id';

-- ============================================================================
-- MIGRATION (2026-08): Phase 1 — nickname + last_activity_at + display names.
--   * shop_staff.nickname: optional short display name. Shown across all logs
--     and the header/account, taking priority: nickname > full_name > email.
--   * shop_staff.last_activity_at: bumped by the server-side auth guard on each
--     successful authorization (see src/lib/auth.ts requireRole), so User
--     Management can show real recency of activity.
--   * shop_movement_actors(): return type gains display_name (resolved from the
--     shop's own staff row); DROP + CREATE because the OUT columns changed.
--   * shop_staff_last_login(): last_sign_in_at for staff-linked users only —
--     scoped to shop_staff, never the whole shared ecosystem auth.users pool.
-- Applied to the live DB; kept here idempotently.
-- ============================================================================
ALTER TABLE public.shop_staff ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.shop_staff ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

DROP FUNCTION IF EXISTS public.shop_movement_actors();
CREATE FUNCTION public.shop_movement_actors()
RETURNS TABLE(user_id uuid, email text, display_name text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT u.id, u.email,
         COALESCE(
           (SELECT COALESCE(NULLIF(btrim(s.nickname), ''), NULLIF(btrim(s.full_name), ''))
            FROM shop_staff s
            WHERE s.user_id = u.id OR lower(btrim(s.email)) = lower(btrim(u.email))
            ORDER BY (s.user_id = u.id) DESC NULLS LAST
            LIMIT 1),
           u.email
         ) AS display_name
  FROM auth.users u
  WHERE u.id IN (
    SELECT DISTINCT performed_by FROM shop_stock_movements WHERE performed_by IS NOT NULL
  )
$function$;
REVOKE ALL ON FUNCTION public.shop_movement_actors() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shop_movement_actors() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shop_staff_last_login()
RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT u.id, u.email, u.last_sign_in_at
  FROM auth.users u
  WHERE u.id IN (SELECT user_id FROM shop_staff WHERE user_id IS NOT NULL)
     OR lower(btrim(u.email)) IN (SELECT lower(btrim(email)) FROM shop_staff WHERE email IS NOT NULL)
$function$;
REVOKE ALL ON FUNCTION public.shop_staff_last_login() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shop_staff_last_login() TO authenticated, service_role;

-- ============================================================================
-- MIGRATION (2026-08): Phase 2 — admin-provisioned users + forced first-login
-- password change.
--   * shop_staff.must_change_password: set true when an admin creates a brand
--     new auth account with a temporary password. The middleware parks such a
--     user on the /ganti-sandi screen until they set their own password (see
--     src/middleware.ts + src/lib/settings-actions.ts changePassword, which
--     clears the flag). NOT set when an admin "claims" an existing ecosystem
--     account (that person keeps their own shared-pool credentials).
--   * shop_find_auth_user(p_email): targeted single-email lookup into the shared
--     auth.users pool, callable only by service_role (the admin create-user
--     action), used to decide create-new vs. link-existing. Returns just the id
--     for the supplied email — never enumerates the 20FIT ecosystem pool.
-- Applied to the live DB; kept here idempotently.
-- ============================================================================
ALTER TABLE public.shop_staff
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.shop_find_auth_user(p_email text)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id FROM auth.users
  WHERE lower(btrim(email)) = lower(btrim(p_email))
  LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public.shop_find_auth_user(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_find_auth_user(text) TO service_role;
