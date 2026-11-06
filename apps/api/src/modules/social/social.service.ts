import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SocialProviderKey } from '../../common/constants/app.constants';
import { PlatformCapabilities, PLATFORM_CAPABILITIES } from './social.constants';
import {
  MediaPayload,
  PostContent,
} from './interfaces/social-provider.interface';
import { adaptContent, validateMediaForPlatform } from './social-content.adapter';
import { SocialProviderRegistry } from './providers/provider.registry';
import { ProviderPublicInfo } from './providers/provider.types';
import { SocialApiError } from './providers/http.util';
import { SocialConnectionError } from './social-errors';
import { SocialTokenService } from './social-token.service';

export interface PublishExecutionResult {
  postId: string;
  platform: SocialProviderKey;
  status: 'PUBLISHED' | 'FAILED';
  externalPostId?: string;
  warning?: string;
  error?: string;
}

export interface SocialAccountSummary {
  id: string;
  provider: SocialProviderKey;
  providerAccountId?: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  status: string;
  connectionState: 'CONNECTED' | 'REFRESH_REQUIRED' | 'EXPIRED' | 'REVOKED' | 'DISCONNECTED';
  canPublish: boolean;
  needsReconnect: boolean;
  tokenExpiresAt?: string;
  tokenExpiresInSeconds?: number;
  refreshTokenExpiresAt?: string;
  scopes: string[];
  lastError?: string;
  lastSyncedAt?: string;
  connectedAt: string;
}

export class SocialPublishError extends Error {
  constructor(
    readonly provider: SocialProviderKey,
    message: string,
    readonly authError = false,
  ) {
    super(message);
    this.name = 'SocialPublishError';
  }
}

const ACCOUNT_SAFE_FIELDS = {
  id: true,
  workspaceId: true,
  provider: true,
  providerAccountId: true,
  displayName: true,
  username: true,
  avatarUrl: true,
  tokenExpiresAt: true,
  refreshTokenExpiresAt: true,
  scopes: true,
  status: true,
  lastError: true,
  lastSyncedAt: true,
  connectedAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SocialProviderRegistry,
    private readonly tokenService: SocialTokenService,
  ) {}

  getSupportedPlatforms(): SocialProviderKey[] {
    return this.registry.all().map((provider) => provider.key);
  }

  getProviderInfo(): ProviderPublicInfo[] {
    return this.registry.publicInfo();
  }

  getCapabilities(platform: SocialProviderKey): PlatformCapabilities {
    return PLATFORM_CAPABILITIES[platform];
  }

  async listAccounts(workspaceId: string): Promise<SocialAccountSummary[]> {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { workspaceId },
      orderBy: { connectedAt: 'desc' },
      select: {
        ...ACCOUNT_SAFE_FIELDS,
        refreshToken: true,
      },
    });
    return accounts.map((account) => this.toSummary(account));
  }

  async getAccount(workspaceId: string, id: string): Promise<SocialAccountSummary> {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id, workspaceId },
      select: {
        ...ACCOUNT_SAFE_FIELDS,
        refreshToken: true,
      },
    });
    if (!account) throw new NotFoundException('Conta social não encontrada.');
    return this.toSummary(account);
  }

  async disconnectAccount(id: string, workspaceId: string): Promise<SocialAccountSummary> {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id, workspaceId },
    });
    if (!account) throw new NotFoundException('Conta social não encontrada.');

    if (account.status !== 'DISCONNECTED') {
      try {
        const tokens = await this.tokenService.readTokens(account);
        await this.registry.get(account.provider).revoke?.({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
      } catch {
        // A revogação remota é melhor esforço; a remoção local é garantida abaixo.
      }
    }

    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        status: 'DISCONNECTED',
        accessToken: '',
        refreshToken: null,
        tokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        tokensEncrypted: true,
        lastError: null,
      },
    });
    return this.getAccount(workspaceId, id);
  }

  async refreshAccount(id: string, workspaceId: string): Promise<SocialAccountSummary> {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id, workspaceId },
    });
    if (!account) throw new NotFoundException('Conta social não encontrada.');
    if (account.status === 'DISCONNECTED') {
      throw new SocialConnectionError('A conta está desconectada. Conecte-a novamente.');
    }
    await this.tokenService.forceRefresh(account);
    return this.getAccount(workspaceId, id);
  }

  validateContent(
    platform: SocialProviderKey,
    content: PostContent,
    media: MediaPayload[],
  ): { ok: boolean; adapted: ReturnType<typeof adaptContent>; errors: string[] } {
    const adapted = adaptContent(platform, content);
    const caps = PLATFORM_CAPABILITIES[platform];
    const { ok, errors } = validateMediaForPlatform(platform, media);
    if (adapted.caption.length > caps.maxCaptionLength) {
      errors.push(`Legenda excede o limite de ${caps.maxCaptionLength} caracteres para ${platform}`);
    }
    if (!ok || errors.length) return { ok: false, adapted, errors };
    return { ok: true, adapted, errors: [] };
  }

  async publishToAccount(input: {
    accountId: string;
    content: PostContent;
    media: MediaPayload[];
    publishAt: Date;
  }): Promise<Omit<PublishExecutionResult, 'postId'>> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account) {
      throw new SocialPublishError('TWITTER', 'Conta social não encontrada.');
    }

    const provider = account.provider as SocialProviderKey;
    const adapter = this.registry.get(provider);

    if (account.status === 'DISCONNECTED') {
      throw new SocialPublishError(provider, 'A conta foi desconectada e não pode publicar.');
    }

    try {
      const accessToken = await this.tokenService.ensureAccessToken(account);
      const adapted = adaptContent(provider, input.content);
      const validation = this.validateContent(provider, input.content, input.media);
      if (!validation.ok) {
        throw new SocialPublishError(
          provider,
          `Conteúdo incompatível com ${adapter.label}: ${validation.errors.join('; ')}`,
        );
      }

      const result = await adapter.publish({
        account: {
          id: account.id,
          providerAccountId: account.providerAccountId,
          displayName: account.displayName,
          username: account.username,
          accessToken,
          metadata: (account.metadata as Record<string, unknown> | null) ?? null,
        },
        content: { ...input.content, caption: adapted.caption, text: adapted.text },
        media: input.media,
        publishAt: input.publishAt,
      });

      if (result.status === 'FAILED') {
        throw new SocialPublishError(provider, 'O provedor recusou a publicação.');
      }

      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date(), lastError: null },
      });

      return {
        platform: provider,
        status: 'PUBLISHED',
        externalPostId: result.externalPostId,
        warning: result.warning,
      };
    } catch (error: any) {
      if (error instanceof SocialPublishError) {
        await this.tokenService.markError(account.id, error.message);
        throw error;
      }

      const message = this.publicProviderMessage(provider, adapter.label, error);
      const authError = this.isAuthError(error);
      if (authError) {
        await this.tokenService.markReconnect(account.id, message);
      } else {
        await this.tokenService.markError(account.id, message);
      }
      throw new SocialPublishError(provider, message, authError);
    }
  }

  private toSummary(account: any): SocialAccountSummary {
    const now = Date.now();
    const tokenExpired = account.tokenExpiresAt ? account.tokenExpiresAt.getTime() <= now : false;
    const refreshExpired = account.refreshTokenExpiresAt
      ? account.refreshTokenExpiresAt.getTime() <= now
      : false;
    const hasRefresh = Boolean(account.refreshToken);
    const status = String(account.status);

    let connectionState: SocialAccountSummary['connectionState'] = 'CONNECTED';
    if (status === 'DISCONNECTED') connectionState = 'DISCONNECTED';
    else if (status === 'REVOKED') connectionState = 'REVOKED';
    else if (status === 'EXPIRED') connectionState = 'EXPIRED';
    else if (tokenExpired) connectionState = hasRefresh && !refreshExpired ? 'REFRESH_REQUIRED' : 'EXPIRED';

    const needsReconnect =
      connectionState === 'EXPIRED' ||
      connectionState === 'REVOKED' ||
      connectionState === 'DISCONNECTED';
    const canPublish = connectionState === 'CONNECTED' || connectionState === 'REFRESH_REQUIRED';

    return {
      id: account.id,
      provider: account.provider,
      providerAccountId: account.providerAccountId ?? undefined,
      displayName: account.displayName || account.username || account.provider,
      username: account.username ?? undefined,
      avatarUrl: account.avatarUrl ?? undefined,
      status,
      connectionState,
      canPublish,
      needsReconnect,
      tokenExpiresAt: account.tokenExpiresAt?.toISOString(),
      tokenExpiresInSeconds: account.tokenExpiresAt
        ? Math.max(0, Math.floor((account.tokenExpiresAt.getTime() - now) / 1000))
        : undefined,
      refreshTokenExpiresAt: account.refreshTokenExpiresAt?.toISOString(),
      scopes: account.scopes ?? [],
      lastError: account.lastError ?? undefined,
      lastSyncedAt: account.lastSyncedAt?.toISOString(),
      connectedAt: account.connectedAt.toISOString(),
    };
  }

  private publicProviderMessage(
    provider: SocialProviderKey,
    label: string,
    error: any,
  ): string {
    if (error instanceof SocialApiError) {
      return error.message;
    }
    if (error instanceof SocialConnectionError) {
      return error.message;
    }
    const raw = String(error?.message || 'Falha desconhecida');
    if (/token|secret|authorization|bearer/i.test(raw)) {
      return `A conexão com ${label} precisa ser renovada. Reconecte a conta nas configurações.`;
    }
    return raw.slice(0, 1000);
  }

  private isAuthError(error: any): boolean {
    if (error instanceof SocialApiError) {
      if (error.statusCode === 401) return true;
      const code = String(error.providerCode || '').toLowerCase();
      if (['190', '102', '401', 'invalid_grant', 'oauth_exception'].includes(code)) return true;
      return /token|expired|unauthorized|invalid_grant|authentication/i.test(error.message);
    }
    return error instanceof SocialConnectionError && error.code !== 'PROVIDER_ERROR';
  }
}
