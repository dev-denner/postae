import { SocialProviderKey } from '../../../common/constants/app.constants';
import {
  AuthorizationUrlInput,
  ExchangeCodeInput,
  OAuthAccountData,
  OAuthTokenSet,
  PublishContext,
  ProviderPublishResult,
  RefreshTokenInput,
  SocialProviderAdapter,
} from './provider.types';
import { envValue, providerRequest, secondsFromNow, splitScopes } from './http.util';

const THREADS_GRAPH = 'https://graph.threads.net/v1.0';
const AUTHORIZE_URL = 'https://threads.net/oauth/authorize';
const TOKEN_URL = 'https://graph.threads.net/oauth/access_token';
const LONG_LIVED_URL = 'https://graph.threads.net/access_token';
const REFRESH_URL = 'https://graph.threads.net/refresh_access_token';

function pollDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ThreadsProvider implements SocialProviderAdapter {
  readonly key: SocialProviderKey = 'THREADS';
  readonly label = 'Threads';
  readonly docsUrl = 'https://developers.facebook.com/docs/threads/posts';
  readonly scopes = ['threads_basic', 'threads_content_publish'];
  readonly usesPkce = false;
  readonly mediaSupport = { text: true, image: true, video: true, carousel: false };
  readonly limitations = [
    'Texto limitado a 500 caracteres; emojis contam como bytes UTF-8.',
    'Imagens devem ser JPEG/PNG com até 8 MB; vídeos e imagens precisam de URL pública.',
    'Limite oficial de 250 publicações via API por perfil em 24 horas.',
    'O token de longa duração expira em cerca de 60 dias e precisa ser renovado.',
    'Carrossel ainda não está habilitado nesta versão do Postaê.',
  ];
  readonly approvalNotes = [
    'A produção exige App Review da Meta para threads_basic e threads_content_publish com Advanced Access.',
    'Sem Advanced Access, a publicação fica restrita a contas com papel no app.',
    'A Meta exige verificação de negócio para uso por clientes externos.',
  ];
  readonly requiredEnv = ['THREADS_CLIENT_ID', 'THREADS_CLIENT_SECRET'];

  isConfigured(): boolean {
    return Boolean(envValue('THREADS_CLIENT_ID') && envValue('THREADS_CLIENT_SECRET'));
  }

  getAuthorizationUrl(input: AuthorizationUrlInput): string {
    const params = new URLSearchParams({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(','),
      state: input.state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(input: ExchangeCodeInput): Promise<OAuthTokenSet> {
    const shortLived = await providerRequest<{
      access_token: string;
      user_id?: string | number;
    }>(this.key, 'Troca do código OAuth do Threads', {
      method: 'POST',
      url: TOKEN_URL,
      data: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret || '',
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
        code: input.code,
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const longLived = await providerRequest<{ access_token: string; expires_in?: number }>(
      this.key,
      'Obtenção do token de longa duração do Threads',
      {
        method: 'GET',
        url: LONG_LIVED_URL,
        params: {
          grant_type: 'th_exchange_token',
          client_secret: input.clientSecret || '',
          access_token: shortLived.access_token,
        },
      },
    );

    return {
      accessToken: longLived.access_token,
      tokenExpiresAt: secondsFromNow(longLived.expires_in) || secondsFromNow(60 * 24 * 60 * 60),
      scopes: this.scopes,
      metadata: { threadsUserId: shortLived.user_id },
    };
  }

  async refreshTokens(input: RefreshTokenInput): Promise<OAuthTokenSet> {
    const result = await providerRequest<{ access_token: string; expires_in?: number }>(
      this.key,
      'Renovação do token do Threads',
      {
        method: 'GET',
        url: REFRESH_URL,
        params: { grant_type: 'th_refresh_token', access_token: input.refreshToken },
      },
    );
    return {
      accessToken: result.access_token,
      tokenExpiresAt: secondsFromNow(result.expires_in) || secondsFromNow(60 * 24 * 60 * 60),
      scopes: this.scopes,
    };
  }

  async fetchAccounts(tokens: OAuthTokenSet): Promise<OAuthAccountData[]> {
    const profile = await providerRequest<{
      id: string;
      username?: string;
      threads_profile_picture_url?: string;
      threads_biography?: string;
    }>(this.key, 'Consulta do perfil do Threads', {
      method: 'GET',
      url: `${THREADS_GRAPH}/me`,
      params: {
        fields: 'id,username,threads_profile_picture_url,threads_biography',
        access_token: tokens.accessToken,
      },
    });

    return [
      {
        providerAccountId: String(profile.id),
        displayName: profile.username || 'Threads',
        username: profile.username,
        avatarUrl: profile.threads_profile_picture_url,
        accessToken: tokens.accessToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        scopes: tokens.scopes?.length ? tokens.scopes : this.scopes,
        metadata: { biography: profile.threads_biography ?? null, threadsUserId: profile.id },
      },
    ];
  }

  async publish(context: PublishContext): Promise<ProviderPublishResult> {
    const userId = context.account.providerAccountId;
    if (!userId) throw new Error('Identificador da conta do Threads ausente.');

    const accessToken = context.account.accessToken;
    const text = context.content.caption ?? context.content.text ?? '';
    const media = context.media.filter((item) => item.url);
    const video = media.find((item) => item.kind === 'VIDEO');
    const image = media.find((item) => item.kind === 'IMAGE');

    if (!text.trim() && !media.length) {
      throw new Error('O Threads exige texto, imagem ou vídeo para publicar.');
    }

    const payload = new URLSearchParams({ access_token: accessToken, text });
    if (video) {
      payload.set('media_type', 'VIDEO');
      payload.set('video_url', video.url);
    } else if (image) {
      payload.set('media_type', 'IMAGE');
      payload.set('image_url', image.url);
    } else {
      payload.set('media_type', 'TEXT');
    }

    const container = await providerRequest<{ id: string }>(
      this.key,
      'Criação do contêiner do Threads',
      {
        method: 'POST',
        url: `${THREADS_GRAPH}/${userId}/threads`,
        data: payload.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    if (video) {
      await this.waitForContainer(container.id, accessToken);
    }

    const published = await providerRequest<{ id: string }>(
      this.key,
      'Publicação do contêiner do Threads',
      {
        method: 'POST',
        url: `${THREADS_GRAPH}/${userId}/threads_publish`,
        data: new URLSearchParams({
          creation_id: container.id,
          access_token: accessToken,
        }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    return {
      externalPostId: published.id,
      status: 'PUBLISHED',
      platformResponse: { containerId: container.id, mediaId: published.id },
    };
  }

  private async waitForContainer(containerId: string, accessToken: string): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = await providerRequest<{
        status?: string;
        error_message?: string;
      }>(this.key, 'Consulta do status do contêiner do Threads', {
        method: 'GET',
        url: `${THREADS_GRAPH}/${containerId}`,
        params: { fields: 'status,error_message', access_token: accessToken },
      });
      const value = String(status.status || '').toUpperCase();
      if (value === 'FINISHED' || value === 'PUBLISHED') return;
      if (value === 'ERROR' || value === 'EXPIRED') {
        throw new Error(
          `O Threads rejeitou a mídia${status.error_message ? `: ${status.error_message}` : '.'}`,
        );
      }
      await pollDelay(3000);
    }
    throw new Error('O Threads não terminou de processar a mídia dentro do tempo esperado.');
  }
}
