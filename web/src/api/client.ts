import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
});

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear the session and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

/** Extract a human-readable message from an axios error. */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error?.message ?? err.message;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}
