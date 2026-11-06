import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decrypt, encrypt } from '../../common/utils/encryption.util';
import { SocialProviderRegistry } from './providers/provider.registry';
import { SocialApiError } from './providers/http.util';
import { envValue } from './providers/http.util';

export interface StartOAuthInput {
  provider: string;
  workspaceId: string;
  userId: string;
  returnTo?: string;
}

export interface StartOAuthResult {
  authorizationUrl: string;
  redirectUri: string;
  expiresInSeconds: number;
}

@Injectable()
export class SocialOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SocialProviderRegistry,
  ) {}

  async start(input: StartOAuthInput): Promise<StartOAuthResult> {
    const adapter = this.registry.get(input.provider);
    const credentials = this.registry.credentialsFor(adapter.key);
    const state = randomBytes(32).toString('hex');
    const codeVerifier = adapter.usesPkce ? randomBytes(48).toString('base64url') : undefined;
    const codeChallenge = codeVerifier
      ? createHash('sha256').update(codeVerifier).digest('base64url')
      : undefined;
    const redirectUri = this.callbackUrl(adapter.key);
    const expiresInSeconds = 600;

    await this.prisma.socialAuthSession.create({
      data: {
        state,
        workspaceId: input.workspaceId,
        userId: input.userId,
        provider: adapter.key,
        codeVerifier: codeVerifier ? encrypt(codeVerifier) : null,
        redirectUri,
        returnTo: this.safeReturnTo(input.returnTo),
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      },
    });

    const authorizationUrl = adapter.getAuthorizationUrl({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri,
      state,
      codeChallenge,
    });

    return { authorizationUrl, redirectUri, expiresInSeconds };
  }

  async handleCallback(
    provider: string,
    query: { code?: string; state?: string; error?: string; error_description?: string },
  ): Promise<string> {
    const adapter = this.registry.get(provider);
    let returnTo = '/settings?tab=accounts';

    try {
      if (!query.state) {
        return this.errorRedirect(adapter.key, 'State OAuth ausente. Inicie a conexão novamente.');
      }

      const session = await this.prisma.socialAuthSession.findUnique({
        where: { state: query.state },
      });
      if (
        !session ||
        session.provider !== adapter.key ||
        session.consumedAt ||
        session.expiresAt.getTime() < Date.now()
      ) {
        return this.errorRedirect(adapter.key, 'Sessão OAuth inválida ou expirada. Tente conectar novamente.');
      }

      await this.prisma.socialAuthSession.update({
        where: { id: session.id },
        data: { consumedAt: new Date() },
      });

      returnTo = session.returnTo || returnTo;

      if (query.error) {
        return this.errorRedirect(
          adapter.key,
          query.error_description || query.error || 'Autorização cancelada pelo usuário.',
          returnTo,
        );
      }
      if (!query.code) {
        return this.errorRedirect(adapter.key, 'Código de autorização ausente.', returnTo);
      }

      const credentials = this.registry.credentialsFor(adapter.key);
      const codeVerifier = session.codeVerifier ? decrypt(session.codeVerifier) : undefined;
      const tokens = await adapter.exchangeCode({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        redirectUri: session.redirectUri,
        code: query.code,
        codeVerifier,
      });

      const accounts = await adapter.fetchAccounts(tokens);
      if (!accounts.length) {
        return this.errorRedirect(
          adapter.key,
          'A autorização foi concluída, mas nenhuma conta publicável foi encontrada.',
          returnTo,
        );
      }

      for (const account of accounts) {
        if (!account.providerAccountId) continue;
        const existing = await this.prisma.socialAccount.findFirst({
          where: {
            workspaceId: session.workspaceId,
            provider: adapter.key,
            providerAccountId: account.providerAccountId,
          },
        });
        const data = {
          providerAccountId: account.providerAccountId,
          displayName: account.displayName || adapter.label,
          username: account.username ?? null,
          avatarUrl: account.avatarUrl ?? null,
          accessToken: encrypt(account.accessToken),
          refreshToken: account.refreshToken ? encrypt(account.refreshToken) : null,
          tokenExpiresAt: account.tokenExpiresAt ?? null,
          refreshTokenExpiresAt: account.refreshTokenExpiresAt ?? null,
          scopes: account.scopes?.length ? account.scopes : adapter.scopes,
          metadata: (account.metadata ?? {}) as any,
          tokensEncrypted: true,
          status: 'ACTIVE' as const,
          lastError: null,
          lastSyncedAt: new Date(),
        };

        if (existing) {
          await this.prisma.socialAccount.update({ where: { id: existing.id }, data });
        } else {
          await this.prisma.socialAccount.create({
            data: { ...data, workspaceId: session.workspaceId, provider: adapter.key },
          });
        }
      }

      return this.successRedirect(adapter.key, accounts.length, returnTo);
    } catch (error: any) {
      return this.errorRedirect(adapter.key, this.publicErrorMessage(error), returnTo);
    }
  }

  callbackUrl(provider: string): string {
    return `${this.callbackBase()}/social/oauth/${provider.toLowerCase()}/callback`;
  }

  private callbackBase(): string {
    const port = process.env.PORT || '3001';
    const configured = envValue('OAUTH_CALLBACK_BASE') || `http://localhost:${port}/api`;
    const base = configured.replace(/\/+$/, '');
    return /\/api$/.test(base) ? base : `${base}/api`;
  }

  private frontendBase(): string {
    return (envValue('FRONTEND_URL') || 'http://localhost:5173').replace(/\/+$/, '');
  }

  private safeReturnTo(value?: string): string | null {
    if (!value) return null;
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    return value.slice(0, 500);
  }

  private successRedirect(provider: string, accountCount: number, returnTo: string): string {
    const url = new URL(`${this.frontendBase()}${returnTo}`);
    url.searchParams.set('social', 'connected');
    url.searchParams.set('provider', provider);
    url.searchParams.set('accounts', String(accountCount));
    return url.toString();
  }

  private errorRedirect(provider: string, message: string, returnTo = '/settings?tab=accounts'): string {
    const url = new URL(`${this.frontendBase()}${returnTo}`);
    url.searchParams.set('social', 'error');
    url.searchParams.set('provider', provider);
    url.searchParams.set('message', message.slice(0, 500));
    return url.toString();
  }

  private publicErrorMessage(error: any): string {
    if (error instanceof SocialApiError) {
      return `${error.provider}: ${error.message}`;
    }
    return String(error?.message || 'Falha ao conectar a conta. Tente novamente.');
  }
}
