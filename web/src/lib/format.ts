export function formatIDR(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('id-ID').format(value);
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  // SQLite returns "YYYY-MM-DD HH:MM:SS" in UTC.
  const iso = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** Pick the localized category name based on the current language. */
export function localizedName(
  row: { name_en?: string; name_id?: string; name?: string } | null | undefined,
  lang: string,
): string {
  if (!row) return '—';
  if (lang.startsWith('id') && row.name_id) return row.name_id;
  return row.name_en ?? row.name ?? '—';
}

/** Convert an array of flat objects to a CSV string and trigger a download. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
