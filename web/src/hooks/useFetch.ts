import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * Minimal data-fetching hook with refetch support.
 * `params` is serialised so changing filters re-runs the request.
 */
export function useFetch<T = any>(url: string | null, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const key = params ? JSON.stringify(params) : '';

  const refetch = useCallback(() => {
    if (!url) return;
    setLoading(true);
    api
      .get<T>(url, { params })
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch((err) => setError(err?.response?.data?.error?.message ?? err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch, setData };
}
