import { api } from './api';
import {
  getRefreshToken,
  notifyLogout,
  setSession,
  type SessionTokens,
  type SessionUser,
} from './session';

interface AuthPayload {
  tokens: SessionTokens;
  user: SessionUser;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const response = await api.post('/auth/login', { email, password });
  const payload = (response.data?.data ?? response.data) as AuthPayload;
  if (!payload?.tokens?.accessToken) {
    throw new Error('A resposta de login não retornou um token válido.');
  }
  setSession(payload.tokens, payload.user);
  return payload.user;
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
  }
  notifyLogout();
}
