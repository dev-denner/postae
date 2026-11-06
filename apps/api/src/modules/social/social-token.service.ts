import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decrypt, encrypt } from '../../common/utils/encryption.util';
import { SocialProviderRegistry } from './providers/provider.registry';
import { OAuthTokenSet } from './providers/provider.types';
import { SocialConnectionError } from './social-errors';

interface StoredTokenAccount {
  id: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  tokensEncrypted: boolean;
  status: string;
  lastError: string | null;
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
}

/**
 * Responsável por criptografar, migrar e renovar credenciais.
 * Nenhum método público devolve tokens para controllers/DTOs.
 */
@Injectable()
export class SocialTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SocialProviderRegistry,
  ) {}

  async readTokens(account: StoredTokenAccount): Promise<DecryptedTokens> {
    if (!account.accessToken && !account.refreshToken) {
      throw new SocialConnectionError(
        'Esta conta não possui credenciais válidas. Conecte-a novamente.',
        'TOKEN_EXPIRED',
      );
    }

    if (account.tokensEncrypted) {
      const accessToken = decrypt(account.accessToken);
      if (!accessToken) {
        await this.markReconnect(account.id, 'Não foi possível descriptografar as credenciais.');
        throw new SocialConnectionError(
          'As credenciais desta conta não puderam ser lidas. Conecte-a novamente.',
          'TOKEN_EXPIRED',
        );
      }
      return {
        accessToken,
        refreshToken: account.refreshToken ? decrypt(account.refreshToken) : undefined,
        tokenExpiresAt: account.tokenExpiresAt ?? undefined,
        refreshTokenExpiresAt: account.refreshTokenExpiresAt ?? undefined,
      };
    }

    // Migração transparente de registros antigos gravados em texto puro.
    // A conta continua funcionando, mas os campos são reescritos criptografados.
    const accessToken = account.accessToken;
    const refreshToken = account.refreshToken || undefined;
    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encrypt(accessToken),
        refreshToken: refreshToken ? encrypt(refreshToken) : null,
        tokensEncrypted: true,
      },
    });
    return {
      accessToken,
      refreshToken,
      tokenExpiresAt: account.tokenExpiresAt ?? undefined,
      refreshTokenExpiresAt: account.refreshTokenExpiresAt ?? undefined,
    };
  }

  async ensureAccessToken(account: StoredTokenAccount): Promise<string> {
    const tokens = await this.readTokens(account);
    const expiresAt = tokens.tokenExpiresAt?.getTime();
    const needsRefresh = Boolean(expiresAt && expiresAt <= Date.now() + 120_000);

    if (!needsRefresh) return tokens.accessToken;

    const adapter = this.registry.get(account.provider);
    if (!adapter.refreshTokens || !tokens.refreshToken) {
      await this.markReconnect(account.id, 'Token expirado e sem refresh token disponível.');
      throw new SocialConnectionError(
        `A conexão com ${adapter.label} expirou. Reconecte a conta nas configurações.`,
        'TOKEN_EXPIRED',
      );
    }

    const refreshExpired =
      tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt.getTime() <= Date.now();
    if (refreshExpired) {
      await this.markReconnect(account.id, 'Refresh token expirado.');
      throw new SocialConnectionError(
        `A renovação automática da conexão com ${adapter.label} expirou. Reconecte a conta.`,
        'TOKEN_EXPIRED',
      );
    }

    let credentials: { clientId: string; clientSecret?: string };
    try {
      credentials = this.registry.credentialsFor(account.provider as any);
    } catch {
      throw new SocialConnectionError(
        `As credenciais técnicas de ${adapter.label} não estão configuradas na API.`,
        'MISSING_CREDENTIALS',
      );
    }

    try {
      const renewed = await adapter.refreshTokens({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        refreshToken: tokens.refreshToken,
      });
      await this.saveTokens(account.id, renewed);
      return renewed.accessToken;
    } catch (error: any) {
      await this.markReconnect(account.id, this.safeMessage(error));
      throw new SocialConnectionError(
        `Não foi possível renovar a conexão com ${adapter.label}. Reconecte a conta.`,
        'TOKEN_REFRESH_FAILED',
      );
    }
  }

  async forceRefresh(account: StoredTokenAccount): Promise<OAuthTokenSet> {
    const adapter = this.registry.get(account.provider);
    const tokens = await this.readTokens(account);
    if (!adapter.refreshTokens || !tokens.refreshToken) {
      throw new SocialConnectionError(
        `${adapter.label} não oferece renovação automática para esta conta. Reconecte a conta.`,
        'TOKEN_REFRESH_FAILED',
      );
    }
    const credentials = this.registry.credentialsFor(account.provider as any);
    const renewed = await adapter.refreshTokens({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken: tokens.refreshToken,
    });
    await this.saveTokens(account.id, renewed);
    return renewed;
  }

  async saveTokens(accountId: string, tokens: OAuthTokenSet): Promise<void> {
    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: {
        accessToken: encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined,
        tokenExpiresAt: tokens.tokenExpiresAt ?? undefined,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? undefined,
        scopes: tokens.scopes?.length ? tokens.scopes : undefined,
        tokensEncrypted: true,
        status: 'ACTIVE',
        lastError: null,
        lastSyncedAt: new Date(),
      },
    });
  }

  async markReconnect(accountId: string, reason: string): Promise<void> {
    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: {
        status: 'EXPIRED',
        lastError: reason.slice(0, 1000),
      },
    });
  }

  async markError(accountId: string, reason: string): Promise<void> {
    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { lastError: reason.slice(0, 1000) },
    });
  }

  private safeMessage(error: any): string {
    return String(error?.message || 'Falha na renovação do token').slice(0, 1000);
  }
}
