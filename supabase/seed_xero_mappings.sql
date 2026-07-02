-- Seed Xero Description -> SKU mappings observed in real quotations (QU-0798).
-- Idempotent: joins by sku_code so it works regardless of variant UUIDs, and
-- skips rows already mapped. Run after products/variants exist.
-- (Rig Target, Ski Machine and Rower from QU-0798 are intentionally omitted —
--  they have no matching SKU yet; map them in-app when they do.)
INSERT INTO shop_xero_product_mappings (xero_description, variant_id)
SELECT d.xdesc, v.variant_id
FROM (VALUES
  ('HYROX - Competition Power Sled (pcs)',            '20FIT-HPS-001'),
  ('HYROX - Interlocking Bumper Plate 25kg (pcs)',    '20FIT-BP-025'),
  ('HYROX - Octo Kettlebell competition 16kg (pcs)',  '20FIT-KB-016'),
  ('HYROX - Octo Kettlebell 24kg (pcs)',              '20FIT-KB-024'),
  ('HYROX - Competition Sandbag 10kg (pcs)',          '20FIT-HSB10-001'),
  ('HYROX - Competition Sandbag 20kg (pcs)',          '20FIT-HSB20-001'),
  ('HYROX - Competition Wall Ball 4kg (pcs)',         '20FIT-HWB4-001'),
  ('HYROX - Competition Wall Ball 6kg (pcs)',         '20FIT-HWB6-001')
) AS d(xdesc, sku)
JOIN shop_product_variants v ON v.sku_code = d.sku
ON CONFLICT (xero_description) DO NOTHING;
