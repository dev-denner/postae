export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

const ACCESS_TOKEN_KEY = 'postae.accessToken';
const REFRESH_TOKEN_KEY = 'postae.refreshToken';
const USER_KEY = 'postae.user';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return storage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}

export function getStoredUser(): SessionUser | null {
  const raw = storage()?.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setSession(tokens: SessionTokens, user?: SessionUser): void {
  const target = storage();
  if (!target) return;
  target.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  target.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  if (user) target.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  const target = storage();
  if (!target) return;
  target.removeItem(ACCESS_TOKEN_KEY);
  target.removeItem(REFRESH_TOKEN_KEY);
  target.removeItem(USER_KEY);
}

export function notifyLogout(): void {
  clearSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth:logout'));
  }
}
