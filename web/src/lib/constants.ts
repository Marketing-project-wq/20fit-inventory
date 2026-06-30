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

export const LOCATION_TYPES = ['warehouse', 'showroom', 'consignment', 'in_transit', 'quarantine'] as const;

export const WRITE_OFF_REASONS = ['damaged_in_storage', 'expired', 'lost', 'theft_suspected', 'sample_giveaway', 'other'] as const;

export const ADJUSTMENT_REASONS = ['cycle_count_correction', 'data_entry_error', 'found_stock', 'other'] as const;
