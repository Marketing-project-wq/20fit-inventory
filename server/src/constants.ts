/**
 * Shared domain constants: movement types, reason codes, permissions and the
 * role → permission matrix from PRD Section 13 (Permissions & Access Control).
 */

// Stock movement types (PRD 8.3.6). Direction is implied by the type.
export const MOVEMENT_TYPES = [
  'purchase_receipt',
  'sale',
  'transfer_in',
  'transfer_out',
  'return_in',
  'return_out',
  'adjustment_in',
  'adjustment_out',
  'write_off',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

// Movement types that increase on-hand quantity.
export const INBOUND_MOVEMENTS: MovementType[] = [
  'purchase_receipt',
  'transfer_in',
  'return_in',
  'adjustment_in',
];

export function movementDirection(type: MovementType): 1 | -1 {
  return INBOUND_MOVEMENTS.includes(type) ? 1 : -1;
}

// Reason codes for write-offs and adjustments (PRD 9.4).
export const WRITE_OFF_REASONS = [
  'damaged_in_storage',
  'expired',
  'lost',
  'theft_suspected',
  'sample_giveaway',
  'other',
] as const;

export const ADJUSTMENT_REASONS = [
  'cycle_count_correction',
  'stock_opname',
  'data_entry_error',
  'found_stock',
  'other',
] as const;

// Return condition flags (PRD 9.2).
export const RETURN_CONDITIONS = ['sellable', 'damaged', 'needs_inspection'] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
export const PERMISSIONS = {
  STOCK_VIEW: 'stock:view',
  STOCK_IN: 'stock:in',
  STOCK_OUT_SALE: 'stock:out_sale',
  RETURN: 'stock:return',
  TRANSFER: 'stock:transfer',
  ADJUSTMENT_REQUEST: 'adjustment:request',
  ADJUSTMENT_APPROVE: 'adjustment:approve',
  OPNAME_MANAGE: 'opname:manage',
  OPNAME_APPROVE: 'opname:approve',
  PRODUCT_MANAGE: 'product:manage',
  SUPPLIER_MANAGE: 'supplier:manage',
  LOCATION_MANAGE: 'location:manage',
  PO_MANAGE: 'po:manage',
  USERS_MANAGE: 'users:manage',
  REPORTS_VIEW: 'reports:view',
  FINANCIAL_VIEW: 'financial:view',
  AUDIT_VIEW: 'audit:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

// ---------------------------------------------------------------------------
// Role definitions & permission matrix (PRD Section 13)
// ---------------------------------------------------------------------------
export interface RoleDefinition {
  key: string;
  name_en: string;
  name_id: string;
  description: string;
  permissions: Permission[];
}

const P = PERMISSIONS;

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'system_admin',
    name_en: 'System Administrator',
    name_id: 'Administrator Sistem',
    description: 'Full access to all functions including user and role management.',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'operations_lead',
    name_en: 'Operations Lead',
    name_id: 'Kepala Operasional',
    description: 'Cross-location operations oversight; approves adjustments and opname.',
    permissions: [
      P.STOCK_VIEW, P.STOCK_IN, P.STOCK_OUT_SALE, P.RETURN, P.TRANSFER,
      P.ADJUSTMENT_REQUEST, P.ADJUSTMENT_APPROVE, P.OPNAME_MANAGE, P.OPNAME_APPROVE,
      P.PRODUCT_MANAGE, P.SUPPLIER_MANAGE, P.LOCATION_MANAGE, P.PO_MANAGE,
      P.REPORTS_VIEW, P.FINANCIAL_VIEW, P.AUDIT_VIEW,
    ],
  },
  {
    key: 'purchasing_owner',
    name_en: 'Purchasing Owner',
    name_id: 'Penanggung Jawab Pembelian',
    description: 'Manages purchase orders, goods receipt, and reorder decisions.',
    permissions: [
      P.STOCK_VIEW, P.STOCK_IN, P.PO_MANAGE, P.PRODUCT_MANAGE, P.SUPPLIER_MANAGE,
      P.REPORTS_VIEW, P.FINANCIAL_VIEW,
    ],
  },
  {
    key: 'warehouse_staff',
    name_en: 'Warehouse Staff',
    name_id: 'Staf Gudang',
    description: 'Receives goods, performs transfers, picking, and stock counts.',
    permissions: [
      P.STOCK_VIEW, P.STOCK_IN, P.TRANSFER, P.ADJUSTMENT_REQUEST, P.OPNAME_MANAGE,
    ],
  },
  {
    key: 'shop_staff',
    name_en: 'Shop / Sales Staff',
    name_id: 'Staf Toko / Penjualan',
    description: 'Front-line B2C sales, stock availability lookup, and returns.',
    permissions: [P.STOCK_VIEW, P.STOCK_OUT_SALE, P.RETURN],
  },
  {
    key: 'finance',
    name_en: 'Finance / Accounting',
    name_id: 'Keuangan / Akuntansi',
    description: 'Inventory valuation, COGS and reporting; read-only on stock.',
    permissions: [P.STOCK_VIEW, P.REPORTS_VIEW, P.FINANCIAL_VIEW, P.AUDIT_VIEW],
  },
  {
    key: 'executive',
    name_en: 'Executive / Management',
    name_id: 'Eksekutif / Manajemen',
    description: 'Dashboard-level visibility for decision-making.',
    permissions: [P.STOCK_VIEW, P.REPORTS_VIEW, P.FINANCIAL_VIEW],
  },
];
