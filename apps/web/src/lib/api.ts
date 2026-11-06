import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setSession,
} from './session';

const configuredBase = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
export const apiBaseUrl = configuredBase ? `${configuredBase}/api` : '/api';

/**
 * Resolve URLs de mídia retornadas pela API. Em dev, sem VITE_API_URL, a URL
 * relativa é servida pelo proxy do Vite. Em produção/servidor estático, usa a
 * origem configurada da API para que os arquivos assinados continuem acessíveis.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  const value = (url || '').trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith('/') && configuredBase) return `${configuredBase}${value}`;
  return value;
}

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
});

let refreshPromise: Promise<string | null> | null = null;

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await axios.post(
      `${apiBaseUrl}/auth/refresh`,
      { refreshToken },
      { timeout: 15000 },
    );
    const payload = response.data?.data ?? response.data;
    const tokens = payload?.tokens;
    if (!tokens?.accessToken || !tokens?.refreshToken) return null;
    setSession(tokens, payload?.user);
    return tokens.accessToken as string;
  } catch {
    return null;
  }
}

function getFreshToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const url = original?.url || '';

    if (status === 401 && original && !original._retried && !url.includes('/auth/')) {
      original._retried = true;
      const token = await getFreshToken();
      if (token) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api.request(original);
      }
      clearSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:logout'));
      }
    }

    return Promise.reject(error);
  },
);

export function getApiError(error: unknown, fallback = 'Não foi possível concluir a operação.'): string {
  const axiosError = error as AxiosError<any>;
  const data = axiosError?.response?.data;
  const message = data?.message;
  if (Array.isArray(message)) return message.join(' ');
  if (typeof message === 'string' && message.trim()) return message;
  if (typeof data?.error === 'string') return data.error;
  if (!axiosError?.response) {
    return 'Não foi possível falar com a API. Verifique se o servidor está em execução.';
  }
  return fallback;
}
