/**
 * Seed the 20FIT Shop Inventory database with a representative demo dataset:
 * roles, one user per role, the multi-brand catalog (Precor / CENTR / HYROX /
 * 20FIT), locations, suppliers, opening stock, and sample movements.
 *
 * Run with: npm run seed  (inside /server)
 */
import bcrypt from 'bcryptjs';
import { db } from './connection.js';
import { newId, documentNumber } from '../utils/id.js';
import { ROLE_DEFINITIONS } from '../constants.js';
import { recomputeStockLevels } from '../services/stock.service.js';

const DEMO_PASSWORD = '20fit1234';

function reset() {
  // Delete in FK-safe order.
  const tables = [
    'audit_log', 'stock_opname_lines', 'stock_opnames', 'adjustments',
    'sales_order_lines', 'sales_orders', 'transfer_order_lines', 'transfer_orders',
    'purchase_order_lines', 'purchase_orders', 'stock_movements', 'stock_levels',
    'product_variants', 'products', 'suppliers', 'locations', 'categories',
    'brands', 'users', 'roles',
  ];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) db.exec(`DELETE FROM ${t}`);
  db.exec('PRAGMA foreign_keys = ON');
}

function seedRolesAndUsers() {
  const roleIdByKey = new Map<string, string>();
  const insertRole = db.prepare(
    'INSERT INTO roles (id, key, name_en, name_id, description, permissions) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const r of ROLE_DEFINITIONS) {
    const id = newId();
    roleIdByKey.set(r.key, id);
    insertRole.run(id, r.key, r.name_en, r.name_id, r.description, JSON.stringify(r.permissions));
  }

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const users: Array<{ name: string; email: string; roleKey: string }> = [
    { name: 'Admin 20FIT', email: 'admin@20fit.id', roleKey: 'system_admin' },
    { name: 'Luthfi (Operations)', email: 'ops@20fit.id', roleKey: 'operations_lead' },
    { name: 'Purchasing Owner', email: 'purchasing@20fit.id', roleKey: 'purchasing_owner' },
    { name: 'Warehouse Staff', email: 'warehouse@20fit.id', roleKey: 'warehouse_staff' },
    { name: 'Shop Staff', email: 'shop@20fit.id', roleKey: 'shop_staff' },
    { name: 'Finance', email: 'finance@20fit.id', roleKey: 'finance' },
    { name: 'Jeff (Executive)', email: 'exec@20fit.id', roleKey: 'executive' },
  ];
  const userIdByKey = new Map<string, string>();
  const insertUser = db.prepare(
    'INSERT INTO users (id, name, email, password_hash, role_id, assigned_locations, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
  );
  for (const u of users) {
    const id = newId();
    userIdByKey.set(u.roleKey, id);
    insertUser.run(id, u.name, u.email, hash, roleIdByKey.get(u.roleKey)!, '[]');
  }
  return { userIdByKey };
}

function seedCatalog() {
  const brand = (name: string, description: string) => {
    const id = newId();
    db.prepare('INSERT INTO brands (id, name, description) VALUES (?, ?, ?)').run(id, name, description);
    return id;
  };
  const brands = {
    precor: brand('Precor', 'Premium commercial cardio & strength equipment'),
    centr: brand('CENTR', "Chris Hemsworth's functional fitness equipment line"),
    hyrox: brand('HYROX', 'Functional fitness racing equipment'),
    own: brand('20FIT', '20FIT own-brand apparel & accessories'),
  };

  const cat = (en: string, id_: string) => {
    const id = newId();
    db.prepare('INSERT INTO categories (id, name_en, name_id) VALUES (?, ?, ?)').run(id, en, id_);
    return id;
  };
  const categories = {
    cardio: cat('Cardio Equipment', 'Alat Kardio'),
    strength: cat('Strength Equipment', 'Alat Kekuatan'),
    functional: cat('Functional Training', 'Latihan Fungsional'),
    apparel: cat('Apparel', 'Pakaian'),
    accessories: cat('Accessories', 'Aksesori'),
  };

  const loc = (name: string, type: string, address: string | null) => {
    const id = newId();
    db.prepare('INSERT INTO locations (id, name, type, address) VALUES (?, ?, ?, ?)').run(id, name, type, address);
    return id;
  };
  const locations = {
    warehouse: loc('Main Warehouse', 'warehouse', 'Gudang Utama, Jakarta'),
    showroom: loc('Capital Place Showroom', 'showroom', 'Capital Place, Jakarta Selatan'),
    consignment: loc('Partner Gym Consignment', 'consignment', 'Partner location'),
    quarantine: loc('Quarantine / Damaged', 'quarantine', 'Main Warehouse — quarantine zone'),
  };

  const supplier = (name: string, lead: number, terms: string) => {
    const id = newId();
    db.prepare(
      'INSERT INTO suppliers (id, name, contact_info, default_lead_time_days, payment_terms) VALUES (?, ?, ?, ?, ?)',
    ).run(id, name, JSON.stringify({ contact_person: 'Account Manager', email: `sales@${name.toLowerCase().replace(/\s+/g, '')}.com` }), lead, terms);
    return id;
  };
  const suppliers = {
    precor: supplier('Precor Indonesia', 45, 'Net 30'),
    centr: supplier('CENTR Distribution', 30, 'Net 30'),
    hyrox: supplier('HYROX Supply', 35, 'Net 14'),
    own: supplier('20FIT Merchandise Vendor', 14, 'Net 7'),
  };

  return { brands, categories, locations, suppliers };
}

interface VariantSpec {
  sku: string;
  attrs?: Record<string, string>;
  uom?: string;
  cost: number;
  sell: number;
  reorder?: number;
  reorderQty?: number;
  serial?: boolean;
}

function seedProducts(brands: any, categories: any) {
  const insertProduct = db.prepare(
    'INSERT INTO products (id, name, description, brand_id, category_id) VALUES (?, ?, ?, ?, ?)',
  );
  const insertVariant = db.prepare(
    `INSERT INTO product_variants
       (id, product_id, sku_code, barcode, variant_attributes, unit_of_measure, cost_price, selling_price,
        reorder_point, reorder_quantity, requires_serial_tracking)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const variantIds: Record<string, string> = {};

  const product = (name: string, desc: string, brandId: string, catId: string, variants: VariantSpec[]) => {
    const pid = newId();
    insertProduct.run(pid, name, desc, brandId, catId);
    for (const v of variants) {
      const vid = newId();
      variantIds[v.sku] = vid;
      insertVariant.run(
        vid, pid, v.sku, null, JSON.stringify(v.attrs ?? {}), v.uom ?? 'pcs',
        v.cost, v.sell, v.reorder ?? null, v.reorderQty ?? null, v.serial ? 1 : 0,
      );
    }
  };

  product('Precor TRM 445 Treadmill', 'Commercial-grade precision treadmill', brands.precor, categories.cardio, [
    { sku: 'PRC-TRM445', uom: 'unit', cost: 45_000_000, sell: 58_000_000, reorder: 2, reorderQty: 3, serial: true },
  ]);
  product('Precor EFX 885 Elliptical', 'Adaptive Motion elliptical trainer', brands.precor, categories.cardio, [
    { sku: 'PRC-EFX885', uom: 'unit', cost: 38_000_000, sell: 49_000_000, reorder: 2, reorderQty: 2, serial: true },
  ]);
  product('Precor Discovery Chest Press', 'Selectorized strength chest press', brands.precor, categories.strength, [
    { sku: 'PRC-DSL-CP', uom: 'unit', cost: 25_000_000, sell: 33_000_000, reorder: 1, reorderQty: 2, serial: true },
  ]);
  product('CENTR Adjustable Dumbbell Set', '2.5–24kg adjustable dumbbell pair', brands.centr, categories.strength, [
    { sku: 'CTR-ADJ-DB', uom: 'set', cost: 4_500_000, sell: 6_200_000, reorder: 5, reorderQty: 10 },
  ]);
  product('CENTR Resistance Bands Kit', '5-band resistance training kit', brands.centr, categories.functional, [
    { sku: 'CTR-RB-KIT', uom: 'box', cost: 350_000, sell: 550_000, reorder: 20, reorderQty: 40 },
  ]);
  product('HYROX Competition Sled', 'Official HYROX push/pull sled', brands.hyrox, categories.functional, [
    { sku: 'HYR-SLED', uom: 'unit', cost: 8_000_000, sell: 11_500_000, reorder: 3, reorderQty: 5 },
  ]);
  product('HYROX Wall Ball 9kg', 'Competition wall ball, 9kg', brands.hyrox, categories.functional, [
    { sku: 'HYR-WB-9', uom: 'pcs', cost: 600_000, sell: 900_000, reorder: 15, reorderQty: 30 },
  ]);
  product('20FIT Performance Tee', 'Moisture-wicking training t-shirt', brands.own, categories.apparel, [
    { sku: 'TWF-TEE-BLK-S', attrs: { size: 'S', color: 'Black' }, cost: 85_000, sell: 199_000, reorder: 25, reorderQty: 50 },
    { sku: 'TWF-TEE-BLK-M', attrs: { size: 'M', color: 'Black' }, cost: 85_000, sell: 199_000, reorder: 25, reorderQty: 50 },
    { sku: 'TWF-TEE-BLK-L', attrs: { size: 'L', color: 'Black' }, cost: 85_000, sell: 199_000, reorder: 25, reorderQty: 50 },
    { sku: 'TWF-TEE-BLK-XL', attrs: { size: 'XL', color: 'Black' }, cost: 85_000, sell: 199_000, reorder: 25, reorderQty: 50 },
  ]);
  product('20FIT Training Gloves', 'Padded training gloves', brands.own, categories.accessories, [
    { sku: 'TWF-GLV-M', attrs: { size: 'M' }, cost: 65_000, sell: 149_000, reorder: 20, reorderQty: 40 },
    { sku: 'TWF-GLV-L', attrs: { size: 'L' }, cost: 65_000, sell: 149_000, reorder: 20, reorderQty: 40 },
  ]);
  product('20FIT Shaker Bottle', '700ml protein shaker bottle', brands.own, categories.accessories, [
    { sku: 'TWF-SHK', cost: 25_000, sell: 79_000, reorder: 40, reorderQty: 80 },
  ]);

  return variantIds;
}

function seedMovements(variantIds: Record<string, string>, locations: any, userId: string) {
  const insert = db.prepare(
    `INSERT INTO stock_movements
       (id, variant_id, location_id, movement_type, quantity, unit_cost, reference_type, reason_code, performed_by, performed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
  );
  const mv = (
    sku: string, locId: string, type: string, qty: number, unitCost: number | null,
    refType: string | null, reason: string | null, daysAgo: number,
  ) => insert.run(newId(), variantIds[sku], locId, type, qty, unitCost, refType, reason, userId, `-${daysAgo} days`);

  // Opening stock — goods receipts into the main warehouse.
  const opening: Array<[string, number, number]> = [
    ['PRC-TRM445', 4, 45_000_000], ['PRC-EFX885', 3, 38_000_000], ['PRC-DSL-CP', 2, 25_000_000],
    ['CTR-ADJ-DB', 18, 4_500_000], ['CTR-RB-KIT', 60, 350_000], ['HYR-SLED', 6, 8_000_000],
    ['HYR-WB-9', 40, 600_000], ['TWF-TEE-BLK-S', 80, 85_000], ['TWF-TEE-BLK-M', 120, 85_000],
    ['TWF-TEE-BLK-L', 100, 85_000], ['TWF-TEE-BLK-XL', 60, 85_000], ['TWF-GLV-M', 50, 65_000],
    ['TWF-GLV-L', 45, 65_000], ['TWF-SHK', 150, 25_000],
  ];
  for (const [sku, qty, cost] of opening) mv(sku, locations.warehouse, 'purchase_receipt', qty, cost, 'purchase_order', null, 60);

  // Distribute some apparel/accessories to the showroom.
  mv('TWF-TEE-BLK-M', locations.showroom, 'transfer_in', 30, 85_000, 'transfer_order', null, 40);
  mv('TWF-TEE-BLK-M', locations.warehouse, 'transfer_out', 30, 85_000, 'transfer_order', null, 40);
  mv('TWF-SHK', locations.showroom, 'transfer_in', 40, 25_000, 'transfer_order', null, 40);
  mv('TWF-SHK', locations.warehouse, 'transfer_out', 40, 25_000, 'transfer_order', null, 40);

  // Sales over the last ~50 days to populate fast/slow-mover analytics.
  const sales: Array<[string, string, number, number]> = [
    ['TWF-SHK', locations.showroom, 35, 5], ['TWF-TEE-BLK-M', locations.showroom, 24, 8],
    ['TWF-TEE-BLK-L', locations.warehouse, 18, 12], ['CTR-RB-KIT', locations.warehouse, 48, 15],
    ['HYR-WB-9', locations.warehouse, 30, 20], ['TWF-GLV-M', locations.warehouse, 22, 10],
    ['CTR-ADJ-DB', locations.warehouse, 12, 18], ['HYR-SLED', locations.warehouse, 3, 25],
    ['PRC-TRM445', locations.warehouse, 2, 30], ['TWF-TEE-BLK-S', locations.warehouse, 8, 22],
  ];
  for (const [sku, loc, qty, daysAgo] of sales) mv(sku, loc, 'sale', qty, null, 'sales_order', 'b2c', daysAgo);

  // A write-off to populate the loss report and management watchlist.
  mv('TWF-GLV-L', locations.warehouse, 'write_off', 3, 65_000, 'adjustment', 'damaged_in_storage', 7);
}

function seedDocuments(ctx: any, userId: string, variantIds: Record<string, string>) {
  // One open (submitted) PO so the dashboard shows an open order.
  const poId = newId();
  db.prepare(
    `INSERT INTO purchase_orders (id, po_number, supplier_id, location_id, status, expected_date, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, 'submitted', date('now', '+20 days'), 'Restock for Q3 B2B pipeline', ?, datetime('now','-5 days'))`,
  ).run(poId, documentNumber('PO'), ctx.suppliers.precor, ctx.locations.warehouse, userId);
  db.prepare(
    'INSERT INTO purchase_order_lines (id, po_id, variant_id, quantity_ordered, quantity_received, unit_cost) VALUES (?, ?, ?, ?, 0, ?)',
  ).run(newId(), poId, variantIds['PRC-TRM445'], 3, 45_000_000);
  db.prepare(
    'INSERT INTO purchase_order_lines (id, po_id, variant_id, quantity_ordered, quantity_received, unit_cost) VALUES (?, ?, ?, ?, 0, ?)',
  ).run(newId(), poId, variantIds['PRC-EFX885'], 2, 38_000_000);

  // A pending write-off awaiting Operations Lead approval.
  db.prepare(
    `INSERT INTO adjustments (id, adjustment_number, type, variant_id, location_id, quantity, reason_code, status, notes, requested_by)
     VALUES (?, ?, 'write_off', ?, ?, 2, 'damaged_in_storage', 'pending', 'Found two damaged boxes during shelving', ?)`,
  ).run(newId(), documentNumber('ADJ'), variantIds['CTR-RB-KIT'], ctx.locations.warehouse, userId);
}

function main() {
  console.log('Seeding 20FIT Shop Inventory database…');
  db.exec('BEGIN IMMEDIATE');
  try {
    reset();
    const { userIdByKey } = seedRolesAndUsers();
    const ctx = seedCatalog();
    const variantIds = seedProducts(ctx.brands, ctx.categories);
    const warehouseUser = userIdByKey.get('warehouse_staff')!;
    const purchasingUser = userIdByKey.get('purchasing_owner')!;
    seedMovements(variantIds, ctx.locations, warehouseUser);
    seedDocuments(ctx, purchasingUser, variantIds);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const updated = recomputeStockLevels();

  // Demonstrate reserved vs available: reserve a few units for a pending B2B order.
  const dbReserve = db.prepare(
    `UPDATE stock_levels SET quantity_reserved = ? WHERE variant_id = (SELECT id FROM product_variants WHERE sku_code = ?) AND location_id = (SELECT id FROM locations WHERE name = 'Main Warehouse')`,
  );
  dbReserve.run(1, 'PRC-EFX885');
  dbReserve.run(5, 'CTR-ADJ-DB');

  const counts = {
    users: (db.prepare('SELECT COUNT(*) c FROM users').get() as any).c,
    products: (db.prepare('SELECT COUNT(*) c FROM products').get() as any).c,
    variants: (db.prepare('SELECT COUNT(*) c FROM product_variants').get() as any).c,
    movements: (db.prepare('SELECT COUNT(*) c FROM stock_movements').get() as any).c,
    stockLevels: updated,
  };
  console.log('Seed complete:', counts);
  console.log(`\nDemo login password for every account: ${DEMO_PASSWORD}`);
  console.log('Accounts: admin@20fit.id, ops@20fit.id, purchasing@20fit.id, warehouse@20fit.id, shop@20fit.id, finance@20fit.id, exec@20fit.id');
}

main();
