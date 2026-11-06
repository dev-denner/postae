import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { SocialProviderKey } from '../../../common/constants/app.constants';

export class SocialApiError extends Error {
  constructor(
    readonly provider: SocialProviderKey,
    message: string,
    readonly statusCode?: number,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'SocialApiError';
  }
}

function extractMessage(data: unknown): string | undefined {
  if (!data) return undefined;
  if (typeof data === 'string') return data.slice(0, 500);
  if (typeof data !== 'object') return undefined;
  const body = data as Record<string, any>;

  if (body.error && typeof body.error === 'object') {
    const nested = body.error;
    if (typeof nested.message === 'string') return nested.message;
    if (typeof nested.error_description === 'string') return nested.error_description;
    if (typeof nested.error === 'string') return nested.error;
  }
  if (typeof body.error_description === 'string') return body.error_description;
  if (typeof body.message === 'string') return body.message;
  if (typeof body.detail === 'string') return body.detail;
  if (typeof body.title === 'string') return body.title;
  if (typeof body.error === 'string') return body.error;
  if (Array.isArray(body.errors) && body.errors.length) {
    return extractMessage(body.errors[0]);
  }
  return undefined;
}

function extractCode(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const body = data as Record<string, any>;
  if (body.error && typeof body.error === 'object') {
    return String(body.error.code ?? body.error.error ?? body.error.type ?? '') || undefined;
  }
  if (body.error && typeof body.error === 'string') return body.error;
  return body.code ? String(body.code) : undefined;
}

/**
 * Executa uma chamada HTTP de provider sem jamais propagar headers, tokens ou
 * a URL completa em mensagens de erro. Apenas a mensagem pública do provider é
 * retornada para a camada de aplicação.
 */
export async function providerRequest<T>(
  provider: SocialProviderKey,
  operation: string,
  config: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await axios.request<T>({
      timeout: 45_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      ...config,
    });
    return response.data;
  } catch (error: any) {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const message =
      extractMessage(data) ||
      (status ? `${operation} falhou (HTTP ${status})` : `${operation} falhou por erro de rede`);
    throw new SocialApiError(provider, String(message).slice(0, 1000), status, extractCode(data));
  }
}

export async function providerRequestRaw<T>(
  provider: SocialProviderKey,
  operation: string,
  config: AxiosRequestConfig,
): Promise<AxiosResponse<T>> {
  try {
    return await axios.request<T>({
      timeout: 60_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      ...config,
    });
  } catch (error: any) {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const message =
      extractMessage(data) ||
      (status ? `${operation} falhou (HTTP ${status})` : `${operation} falhou por erro de rede`);
    throw new SocialApiError(provider, String(message).slice(0, 1000), status, extractCode(data));
  }
}

export function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

export function secondsFromNow(seconds?: number | string): Date | undefined {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return new Date(Date.now() + value * 1000);
}

export function splitScopes(scope?: string | string[]): string[] {
  if (!scope) return [];
  if (Array.isArray(scope)) return scope.filter(Boolean);
  return scope.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

export function truncate(value: string | undefined | null, max: number): string {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}
