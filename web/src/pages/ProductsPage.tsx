import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../api/client';
import { P } from '../lib/permissions';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Select, Input, Modal, Field, Textarea } from '../components/ui';
import { formatNumber, formatIDR, localizedName } from '../lib/format';

export function ProductsPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can(P.PRODUCT_MANAGE);
  const canSeeCost = can(P.FINANCIAL_VIEW);
  const lang = i18n.language;

  const [filters, setFilters] = useState({ search: '', brand_id: '', category_id: '', status: '' });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [variantForProduct, setVariantForProduct] = useState<string | null>(null);

  const { data: brands } = useFetch<any[]>('/brands');
  const { data: categories } = useFetch<any[]>('/categories');
  const { data, loading, refetch } = useFetch<any[]>('/products', {
    search: filters.search || undefined,
    brand_id: filters.brand_id || undefined,
    category_id: filters.category_id || undefined,
    status: filters.status || undefined,
  });

  return (
    <div>
      <PageHeader
        title={t('products.title')}
        subtitle={t('products.subtitle')}
        actions={
          canManage ? (
            <button className="btn-primary" onClick={() => setShowProductForm(true)}>
              + {t('products.addProduct')}
            </button>
          ) : null
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Input placeholder={t('common.search')} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <Select value={filters.brand_id} onChange={(e) => setFilters({ ...filters, brand_id: e.target.value })}>
            <option value="">{t('common.all')} — {t('common.brand')}</option>
            {brands?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
          <Select value={filters.category_id} onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}>
            <option value="">{t('common.all')} — {t('common.category')}</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>
            ))}
          </Select>
          <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">{t('common.all')}</option>
            <option value="active">{t('common.active')}</option>
            <option value="inactive">{t('common.inactive')}</option>
          </Select>
        </div>
      </Card>

      <Card>
        {loading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table
            head={
              <tr>
                <th className="th">{t('common.product')}</th>
                <th className="th">{t('common.brand')}</th>
                <th className="th">{t('common.category')}</th>
                <th className="th text-right">{t('products.variantCount')}</th>
                <th className="th text-right">{t('products.totalOnHand')}</th>
                <th className="th">{t('common.status')}</th>
              </tr>
            }
          >
            {data.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailId(p.id)}>
                <td className="td font-medium text-gray-900">{p.name}</td>
                <td className="td">{p.brand_name ?? '—'}</td>
                <td className="td">{localizedName({ name_en: p.category_name_en, name_id: p.category_name_id }, lang)}</td>
                <td className="td text-right">{p.variant_count}</td>
                <td className="td text-right font-medium">{formatNumber(p.total_on_hand)}</td>
                <td className="td">
                  <Badge tone={p.is_active ? 'green' : 'gray'}>{p.is_active ? t('common.active') : t('common.inactive')}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {detailId && (
        <ProductDetail
          id={detailId}
          lang={lang}
          canManage={canManage}
          canSeeCost={canSeeCost}
          onClose={() => setDetailId(null)}
          onAddVariant={(pid: string) => setVariantForProduct(pid)}
        />
      )}

      {showProductForm && (
        <ProductForm
          brands={brands ?? []}
          categories={categories ?? []}
          lang={lang}
          onClose={() => setShowProductForm(false)}
          onSaved={() => {
            setShowProductForm(false);
            refetch();
            toast('success', t('common.added'));
          }}
        />
      )}

      {variantForProduct && (
        <VariantForm
          productId={variantForProduct}
          onClose={() => setVariantForProduct(null)}
          onSaved={() => {
            setVariantForProduct(null);
            refetch();
            toast('success', t('common.added'));
          }}
        />
      )}
    </div>
  );
}

function ProductDetail({ id, lang, canManage, canSeeCost, onClose, onAddVariant }: any) {
  const { t } = useTranslation();
  const { data, loading } = useFetch<any>(`/products/${id}`);

  return (
    <Modal open onClose={onClose} title={data?.name ?? t('common.loading')} size="xl">
      {loading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-gray-400">{t('common.brand')}: </span>
              {data.brand_name ?? '—'}
            </div>
            <div>
              <span className="text-gray-400">{t('common.category')}: </span>
              {localizedName({ name_en: data.category_name_en, name_id: data.category_name_id }, lang)}
            </div>
            <Badge tone={data.is_active ? 'green' : 'gray'}>{data.is_active ? t('common.active') : t('common.inactive')}</Badge>
          </div>
          {data.description && <p className="text-sm text-gray-600">{data.description}</p>}

          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">{t('products.variants')}</h3>
            {canManage && (
              <button className="btn-secondary text-xs" onClick={() => onAddVariant(id)}>
                + {t('products.newVariant')}
              </button>
            )}
          </div>

          {data.variants.length === 0 ? (
            <EmptyState message={t('products.noVariants')} />
          ) : (
            <div className="space-y-4">
              {data.variants.map((v: any) => (
                <Card key={v.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-gray-900">{v.sku_code}</div>
                      <div className="text-xs text-gray-500">
                        {Object.entries(v.variant_attributes || {})
                          .map(([k, val]) => `${k}: ${val}`)
                          .join(' · ') || v.unit_of_measure}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      {canSeeCost && (
                        <div>
                          <span className="text-gray-400">{t('common.costPrice')}: </span>
                          {formatIDR(v.cost_price)}
                        </div>
                      )}
                      <div>
                        <span className="text-gray-400">{t('common.sellingPrice')}: </span>
                        {formatIDR(v.selling_price)}
                      </div>
                      <div>
                        <span className="text-gray-400">{t('products.reorderPoint')}: </span>
                        {v.reorder_point ?? '—'}
                      </div>
                      {v.requires_serial_tracking && <Badge tone="purple">{t('products.serialTracking')}</Badge>}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {v.stock.length === 0 ? (
                      <div className="text-xs text-gray-400">{t('common.noData')}</div>
                    ) : (
                      v.stock.map((s: any) => (
                        <div key={s.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                          <div className="text-xs text-gray-500">{s.location_name}</div>
                          <div className="font-medium">
                            {formatNumber(s.quantity_available)} {t('common.available')}
                            <span className="text-xs font-normal text-gray-400">
                              {' '}/ {formatNumber(s.quantity_on_hand)} {t('common.onHand')}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ProductForm({ brands, categories, lang, onClose, onSaved }: any) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', description: '', brand_id: '', category_id: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/products', {
        name: form.name,
        description: form.description || undefined,
        brand_id: form.brand_id || null,
        category_id: form.category_id || null,
      });
      onSaved();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('products.createProductTitle')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('common.name')}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label={t('common.description')}>
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.brand')}>
            <Select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
              <option value="">{t('common.none')}</option>
              {brands.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.category')}>
            <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">{t('common.none')}</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function VariantForm({ productId, onClose, onSaved }: any) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState({
    sku_code: '', barcode: '', unit_of_measure: 'pcs', cost_price: 0, selling_price: 0,
    reorder_point: '', reorder_quantity: '', attrs: '', requires_serial_tracking: false,
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let variant_attributes: Record<string, string> | undefined;
      if (form.attrs.trim()) {
        variant_attributes = {};
        for (const pair of form.attrs.split(',')) {
          const [k, v] = pair.split(':').map((s) => s.trim());
          if (k && v) variant_attributes[k] = v;
        }
      }
      await api.post('/variants', {
        product_id: productId,
        sku_code: form.sku_code,
        barcode: form.barcode || null,
        unit_of_measure: form.unit_of_measure,
        cost_price: Number(form.cost_price),
        selling_price: Number(form.selling_price),
        reorder_point: form.reorder_point ? Number(form.reorder_point) : null,
        reorder_quantity: form.reorder_quantity ? Number(form.reorder_quantity) : null,
        requires_serial_tracking: form.requires_serial_tracking,
        variant_attributes,
      });
      onSaved();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('products.createVariantTitle')}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('products.skuCode')}>
            <Input value={form.sku_code} onChange={(e) => setForm({ ...form, sku_code: e.target.value })} required />
          </Field>
          <Field label={t('products.barcode')}>
            <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </Field>
          <Field label={t('products.unitOfMeasure')}>
            <Input value={form.unit_of_measure} onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })} />
          </Field>
          <Field label={`${t('products.attributes')} (${t('common.optional')})`} hint="size: L, color: Black">
            <Input value={form.attrs} onChange={(e) => setForm({ ...form, attrs: e.target.value })} placeholder="size: L, color: Black" />
          </Field>
          <Field label={t('common.costPrice')}>
            <Input type="number" min={0} value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} />
          </Field>
          <Field label={t('common.sellingPrice')}>
            <Input type="number" min={0} value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })} />
          </Field>
          <Field label={t('products.reorderPoint')}>
            <Input type="number" min={0} value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} />
          </Field>
          <Field label={t('products.reorderQty')}>
            <Input type="number" min={0} value={form.reorder_quantity} onChange={(e) => setForm({ ...form, reorder_quantity: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={form.requires_serial_tracking} onChange={(e) => setForm({ ...form, requires_serial_tracking: e.target.checked })} />
          {t('products.serialTracking')}
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
