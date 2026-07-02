# scripts/generate_seed_sql.py
# Membaca Stock_Opname.xlsx + product_name_mapping.json dan menghasilkan SQL seed
# untuk tabel shop_* di Supabase. Data nyata April–Juni 2026.
#
# Jalankan:
#   python scripts/generate_seed_sql.py Stock_Opname.xlsx <OUT_DIR>
# Menghasilkan (di OUT_DIR):
#   seed_A_reference.sql   brands, categories, locations, suppliers, products, variants
#   seed_B_movements.sql   stock_movements (masuk/keluar) + adjustment stok awal (estimasi)
#   seed_C_levels.sql      recompute shop_stock_levels + query verifikasi
import sys
import json
import re
import uuid
from collections import defaultdict
from openpyxl import load_workbook

NS = uuid.uuid5(uuid.NAMESPACE_DNS, "shop.20fit.id")
LOC_KUNINGAN = str(uuid.uuid5(NS, "loc:Gudang Kuningan"))
IN_SHEETS = ["Masuk Apr26", "Masuk May26", "Masuk June26"]
OUT_SHEETS = ["Keluar Apr26", "Keluar May26", "Keluar June26"]


def uid(key):
    return str(uuid.uuid5(NS, key))


def q(v):
    """SQL string literal or NULL."""
    if v is None:
        return "NULL"
    s = re.sub(r"\s+", " ", str(v)).strip()
    if s == "":
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def num(v):
    if v is None:
        return "NULL"
    try:
        return str(round(float(v), 2))
    except (TypeError, ValueError):
        return "NULL"


def col(r, i):
    return r[i] if i < len(r) else None


mapping = json.load(open("scripts/product_name_mapping.json"))
name_norm = {re.sub(r"\s+", " ", k).strip().lower(): v for k, v in mapping["name_aliases"].items()}
code_norm = {re.sub(r"\s+", " ", k).strip().lower(): v for k, v in mapping.get("code_aliases", {}).items()}


def sku_by_name(n):
    return name_norm.get(re.sub(r"\s+", " ", str(n)).strip().lower()) if n is not None else None


def sku_by_code(c):
    return code_norm.get(re.sub(r"\s+", " ", str(c)).strip().lower()) if c is not None else None


CATEGORIES = [
    "Perform Treadmill", "Perform Rig & Accessories", "Perform Turf",
    "Octo Kettlebells", "Wall Ball", "Sandbag",
    "Competition Power Sled & Power Rope", "Interlocking Bumper Plates",
    "Urethane Dumbbells", "Rower", "Ski Machine", "Air Bike", "Half Rack",
]


def category_for(sku):
    s = sku.upper()
    if "-TM-" in s:
        return "Perform Treadmill"
    if "-HPS-" in s or "-HBR-" in s:
        return "Competition Power Sled & Power Rope"
    if "-HBT-" in s:
        return "Perform Rig & Accessories"
    if "-HWB" in s:
        return "Wall Ball"
    if "-HSB" in s:
        return "Sandbag"
    if "-KB-" in s:
        return "Octo Kettlebells"
    if "-BP-" in s or "-TP-" in s:
        return "Interlocking Bumper Plates"
    if "-DB-" in s:
        return "Urethane Dumbbells"
    if "-TURF-" in s:
        return "Perform Turf"
    return "Perform Rig & Accessories"


def detect_channel(salesperson, client):
    combined = f"{salesperson or ''} {client or ''}".lower()
    if "tokped" in combined or "tokopedia" in combined:
        return "tokopedia"
    if "shopee" in combined:
        return "shopee"
    b2b = ["vertex8", "celebrity fitness", "pt mutiara", "fitness first", "fortefitness",
           "plantaran", "ferrari", "bfb", "core fitness", "arena", "atlas", "the bali physio",
           "targetfit", "cipta mufida", "ibu dewi"]
    for c in b2b:
        if c in combined:
            return "b2b_direct"
    return "offline"


wb = load_workbook(sys.argv[1] if len(sys.argv) > 1 else "Stock_Opname.xlsx",
                   read_only=True, data_only=True)
out_dir = sys.argv[2] if len(sys.argv) > 2 else "."

# --- Build SKU registry (price + canonical name) ---
sku_price = {}   # sku -> (cost, sell)
sku_name = {}    # sku -> canonical name
ws = wb["coret coret"]
for r in ws.iter_rows(values_only=True):
    if col(r, 0) is not None and isinstance(col(r, 0), (int, float)):
        code, name, cost, sell = col(r, 1), col(r, 2), col(r, 4), col(r, 6)
        sku = sku_by_code(code) or sku_by_name(name)
        if not sku:
            continue
        sku_price.setdefault(sku, (cost, sell))
        if name and sku not in sku_name:
            sku_name[sku] = str(name).strip()

# --- Walk transactions: collect names, quantities, movement rows ---
txn_names = defaultdict(list)
net = defaultdict(int)
movements = []   # (sku, type, qty, unit_cost_src, ref_type, channel, notes, ts)
unmapped = defaultdict(int)

for sheet in IN_SHEETS:
    for r in wb[sheet].iter_rows(values_only=True):
        if col(r, 0) is not None and hasattr(col(r, 0), "strftime") and col(r, 1) is not None and col(r, 2) is not None:
            name = str(col(r, 1)).strip()
            sku = sku_by_name(name)
            if not sku:
                unmapped[name] += 1
                continue
            txn_names[sku].append(name)
            qty = int(col(r, 2))
            net[sku] += qty
            ts = col(r, 0).strftime("%Y-%m-%d 09:00:00+07")
            movements.append((sku, "purchase_receipt", qty, "cost", "bulk_import", None, col(r, 3), ts))

for sheet in OUT_SHEETS:
    for r in wb[sheet].iter_rows(values_only=True):
        if col(r, 0) is not None and hasattr(col(r, 0), "strftime") and col(r, 1) is not None and col(r, 2) is not None:
            name = str(col(r, 1)).strip()
            sku = sku_by_name(name)
            if not sku:
                unmapped[name] += 1
                continue
            txn_names[sku].append(name)
            qty = int(col(r, 2))
            net[sku] -= qty
            ts = col(r, 0).strftime("%Y-%m-%d 14:00:00+07")
            sp = col(r, 3)
            cl = col(r, 4)
            channel = detect_channel(sp, cl)
            note = " — ".join([x for x in [str(sp).strip() if sp else None, str(cl).strip() if cl else None] if x])
            movements.append((sku, "sale", qty, None, "manual", channel, note, ts))

# Canonical name per SKU: price-list name, else prefer a "Hyrox ..." transaction name.
all_skus = set(sku_price) | set(txn_names)
for sku in all_skus:
    if sku in sku_name:
        continue
    cands = txn_names.get(sku, [])
    hyrox = [c for c in cands if c.lower().startswith("hyrox")]
    sku_name[sku] = (hyrox[0] if hyrox else (cands[0] if cands else sku))

# --- Opening balance (estimasi) so no SKU ends negative ---
opening = {sku: -n for sku, n in net.items() if n < 0}

# ---------------- Emit SQL ----------------
BRANDS = ["HYROX", "CENTR", "Precor", "20FIT"]
SUPPLIER = "Centr x HYROX (Principal China)"

A = []
A.append("-- SEED A: reference + products + variants (dari Stock_Opname.xlsx)")
A.append("TRUNCATE TABLE shop_stock_movements, shop_stock_opname_lines, shop_stock_opname_sessions,")
A.append("  shop_purchase_order_lines, shop_purchase_orders, shop_stock_levels,")
A.append("  shop_warehouse_access_log, shop_xero_product_mappings, shop_product_variants,")
A.append("  shop_products, shop_suppliers, shop_locations, shop_categories, shop_brands CASCADE;")
A.append("")
A.append("INSERT INTO shop_brands (brand_id, name) VALUES")
A.append(",\n".join(f"  ('{uid('brand:'+b)}', {q(b)})" for b in BRANDS) + ";")
A.append("")
A.append("INSERT INTO shop_categories (category_id, name) VALUES")
A.append(",\n".join(f"  ('{uid('cat:'+c)}', {q(c)})" for c in CATEGORIES) + ";")
A.append("")
A.append("INSERT INTO shop_locations (location_id, name, type, address, is_primary) VALUES")
A.append(f"  ('{uid('loc:Gudang Kuningan')}', 'Gudang Kuningan', 'warehouse', 'Kuningan, Jakarta Selatan', true),")
A.append(f"  ('{uid('loc:Menteng Prada')}', 'Menteng Prada', 'warehouse', 'Menteng Prada, Jakarta', false),")
A.append(f"  ('{uid('loc:20FIT Sinabung')}', '20FIT Sinabung', 'warehouse', 'Jl. Sinabung No.9, Jakarta Selatan', false);")
A.append("")
A.append("INSERT INTO shop_suppliers (supplier_id, name, default_lead_time_days, payment_terms) VALUES")
A.append(f"  ('{uid('supplier:'+SUPPLIER)}', {q(SUPPLIER)}, 45, 'Net 30');")
A.append("")
hyrox_brand = uid("brand:HYROX")
prod_rows, var_rows = [], []
for sku in sorted(all_skus):
    name = sku_name[sku]
    cost, sell = sku_price.get(sku, (None, None))
    cat = uid("cat:" + category_for(sku))
    prod_rows.append(f"  ('{uid('product:'+sku)}', {q(name)}, {q(name)}, '{hyrox_brand}', '{cat}')")
    var_rows.append(
        f"  ('{uid('variant:'+sku)}', '{uid('product:'+sku)}', {q(sku)}, 'pcs', {num(cost)}, {num(sell)})"
    )
A.append("INSERT INTO shop_products (product_id, name, name_en, brand_id, category_id) VALUES")
A.append(",\n".join(prod_rows) + ";")
A.append("")
A.append("INSERT INTO shop_product_variants (variant_id, product_id, sku_code, unit_of_measure, cost_price, selling_price) VALUES")
A.append(",\n".join(var_rows) + ";")
A.append("")

B = []
B.append("-- SEED B: stock movements (data nyata) + opening balance estimasi")
val_rows = []
OPEN_NOTE = "Estimasi stok awal (perlu opname fisik)"
# Opening balance adjustments first (dated 2026-03-31)
for sku in sorted(opening):
    qty = opening[sku]
    cost, _ = sku_price.get(sku, (None, None))
    val_rows.append(
        f"  ({q(sku)},'adjustment_in',{qty},{num(cost)},'adjustment','opening_balance_estimated',NULL,{q(OPEN_NOTE)},'2026-03-31 08:00:00+07')"
    )
# Real movements
for sku, mtype, qty, cost_src, ref, channel, note, ts in movements:
    cost, _ = sku_price.get(sku, (None, None))
    unit_cost = num(cost) if cost_src == "cost" else "NULL"
    val_rows.append(
        f"  ({q(sku)},{q(mtype)},{qty},{unit_cost},{q(ref)},NULL,{q(channel)},{q(note)},{q(ts)})"
    )
# Compact INSERT...SELECT: reference variants by sku_code, location once.
B.append("INSERT INTO shop_stock_movements")
B.append("  (variant_id, location_id, movement_type, quantity, unit_cost, reference_type, reason_code, sales_channel, notes, performed_at)")
B.append(f"SELECT v.variant_id, '{LOC_KUNINGAN}', d.mtype, d.qty::int, d.cost::numeric, d.ref, d.reason, d.channel, d.note, d.ts::timestamptz")
B.append("FROM (VALUES")
B.append(",\n".join(val_rows))
B.append(") AS d(sku, mtype, qty, cost, ref, reason, channel, note, ts)")
B.append("JOIN shop_product_variants v ON v.sku_code = d.sku;")
B.append("")

C = []
C.append("-- SEED C: recompute shop_stock_levels dari ledger + verifikasi")
C.append("""INSERT INTO shop_stock_levels (variant_id, location_id, quantity_on_hand, quantity_reserved)
SELECT variant_id, location_id,
  SUM(CASE WHEN movement_type IN ('purchase_receipt','transfer_in','return_in','adjustment_in')
           THEN quantity ELSE -quantity END),
  0
FROM shop_stock_movements
GROUP BY variant_id, location_id
ON CONFLICT (variant_id, location_id)
DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand, last_updated_at = NOW();""")
C.append("")

with open(f"{out_dir}/seed_A_reference.sql", "w") as f:
    f.write("\n".join(A))
with open(f"{out_dir}/seed_B_movements.sql", "w") as f:
    f.write("\n".join(B))
with open(f"{out_dir}/seed_C_levels.sql", "w") as f:
    f.write("\n".join(C))
# Combined file for reference / CLI.
with open("supabase/seed_from_excel.sql", "w") as f:
    f.write("\n".join(A + [""] + B + [""] + C))

# --- Summary to stderr ---
def er(*a):
    print(*a, file=sys.stderr)


er(f"SKUs: {len(all_skus)} | with price: {len(sku_price)} | movements: {len(movements)} "
   f"| opening adjustments: {len(opening)}")
ending = {sku: net[sku] + opening.get(sku, 0) for sku in all_skus}
er(f"ending stock min: {min(ending.values())} (should be >= 0), max: {max(ending.values())}")
er(f"purchase_receipt rows: {sum(1 for m in movements if m[1]=='purchase_receipt')} | "
   f"sale rows: {sum(1 for m in movements if m[1]=='sale')}")
if unmapped:
    er(f"UNMAPPED ({len(unmapped)}):")
    for n, c in sorted(unmapped.items()):
        er(f"  [{c}x] {n!r}")
else:
    er("UNMAPPED: none — 100% mapped")
