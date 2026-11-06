import { SocialProviderKey } from '../../../common/constants/app.constants';
import { MediaPayload } from '../interfaces/social-provider.interface';
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
import { envValue, providerRequest, requirePublicMediaUrl, secondsFromNow, splitScopes } from './http.util';

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const CODE_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const LONG_LIVED_TOKEN_URL = 'https://graph.instagram.com/access_token';
const REFRESH_TOKEN_URL = 'https://graph.instagram.com/refresh_access_token';

function graphBase(): string {
  const version = envValue('META_GRAPH_VERSION') || 'v26.0';
  return `https://graph.instagram.com/${version}`;
}

function pollDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class InstagramProvider implements SocialProviderAdapter {
  readonly key: SocialProviderKey = 'INSTAGRAM';
  readonly label = 'Instagram';
  readonly docsUrl = 'https://developers.facebook.com/docs/instagram-platform/content-publishing';
  readonly scopes = ['instagram_business_basic', 'instagram_business_content_publish'];
  readonly usesPkce = false;
  readonly mediaSupport = { text: false, image: true, video: true, carousel: true };
  readonly limitations = [
    'Somente contas profissionais (Business ou Creator) do Instagram podem publicar via API.',
    'Toda publicação exige mídia hospedada em URL pública (imagem JPEG, vídeo MP4/MOV).',
    'O limite oficial é de 100 publicações via API por conta em janela móvel de 24 horas.',
    'O token de longa duração expira em cerca de 60 dias e precisa ser renovado.',
  ];
  readonly approvalNotes = [
    'A produção exige App Review da Meta com Advanced Access para instagram_business_basic e instagram_business_content_publish.',
    'A Meta exige verificação de negócio (Business Verification) para uso por contas que não sejam administradoras/testadoras do app.',
    'Em modo de desenvolvimento, apenas contas com papel no app conseguem autorizar.',
  ];
  readonly requiredEnv = ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'];

  isConfigured(): boolean {
    return Boolean(envValue('INSTAGRAM_CLIENT_ID') && envValue('INSTAGRAM_CLIENT_SECRET'));
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
      user_id?: string;
      permissions?: string;
    }>(this.key, 'Troca do código OAuth do Instagram', {
      method: 'POST',
      url: CODE_TOKEN_URL,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret || '',
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
        code: input.code,
      }).toString(),
    });

    const longLived = await providerRequest<{
      access_token: string;
      expires_in?: number;
    }>(this.key, 'Obtenção do token de longa duração do Instagram', {
      method: 'GET',
      url: LONG_LIVED_TOKEN_URL,
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: input.clientSecret || '',
        access_token: shortLived.access_token,
      },
    });

    return {
      accessToken: longLived.access_token,
      tokenExpiresAt: secondsFromNow(longLived.expires_in) || secondsFromNow(60 * 24 * 60 * 60),
      scopes: splitScopes(shortLived.permissions),
      metadata: { instagramUserId: shortLived.user_id },
    };
  }

  async refreshTokens(input: RefreshTokenInput): Promise<OAuthTokenSet> {
    const result = await providerRequest<{ access_token: string; expires_in?: number }>(
      this.key,
      'Renovação do token do Instagram',
      {
        method: 'GET',
        url: REFRESH_TOKEN_URL,
        params: { grant_type: 'ig_refresh_token', access_token: input.refreshToken },
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
      id?: string;
      user_id?: string;
      username?: string;
      account_type?: string;
      profile_picture_url?: string;
    }>(this.key, 'Consulta do perfil do Instagram', {
      method: 'GET',
      url: `${graphBase()}/me`,
      params: {
        fields: 'user_id,username,account_type,profile_picture_url',
        access_token: tokens.accessToken,
      },
    });

    const providerAccountId = profile.user_id || profile.id;
    if (!providerAccountId) {
      throw new Error('A API do Instagram não retornou o identificador da conta.');
    }

    return [
      {
        providerAccountId,
        displayName: profile.username || 'Instagram',
        username: profile.username,
        avatarUrl: profile.profile_picture_url,
        accessToken: tokens.accessToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        scopes: tokens.scopes?.length ? tokens.scopes : this.scopes,
        metadata: { accountType: profile.account_type, instagramUserId: providerAccountId },
      },
    ];
  }

  async publish(context: PublishContext): Promise<ProviderPublishResult> {
    const igUserId = context.account.providerAccountId;
    if (!igUserId) throw new Error('Identificador da conta do Instagram ausente.');
    const caption = context.content.caption ?? context.content.text ?? '';
    const media = context.media.filter((item) => item.url);
    if (!media.length) {
      throw new Error('O Instagram não permite publicar apenas texto; selecione uma imagem ou vídeo.');
    }

    const accessToken = context.account.accessToken;
    let containerId: string;

    if (media.length > 1) {
      const videos = media.filter((item) => item.kind === 'VIDEO');
      if (videos.length) {
        throw new Error(
          'Nesta versão, carrossel do Instagram aceita apenas imagens. Para vídeo, selecione uma única mídia.',
        );
      }
      const children: string[] = [];
      for (const item of media.slice(0, 10)) {
        const child = await providerRequest<{ id: string }>(
          this.key,
          'Criação de item de carrossel do Instagram',
          {
            method: 'POST',
            url: `${graphBase()}/${igUserId}/media`,
            data: new URLSearchParams({
              image_url: requirePublicMediaUrl(item, 'Instagram'),
              is_carousel_item: 'true',
              access_token: accessToken,
            }).toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        );
        children.push(child.id);
      }
      const parent = await providerRequest<{ id: string }>(
        this.key,
        'Criação do carrossel do Instagram',
        {
          method: 'POST',
          url: `${graphBase()}/${igUserId}/media`,
          data: new URLSearchParams({
            media_type: 'CAROUSEL',
            children: children.join(','),
            caption,
            access_token: accessToken,
          }).toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
      containerId = parent.id;
    } else {
      const item = media[0];
      const isVideo = item.kind === 'VIDEO';
      const payload = new URLSearchParams({
        caption,
        access_token: accessToken,
      });
      if (isVideo) {
        payload.set('media_type', 'REELS');
        payload.set('video_url', requirePublicMediaUrl(item, 'Instagram'));
        payload.set('share_to_feed', 'true');
      } else {
        payload.set('image_url', requirePublicMediaUrl(item, 'Instagram'));
      }
      const container = await providerRequest<{ id: string }>(
        this.key,
        'Criação do contêiner de mídia do Instagram',
        {
          method: 'POST',
          url: `${graphBase()}/${igUserId}/media`,
          data: payload.toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
      containerId = container.id;
    }

    await this.waitForContainer(containerId, accessToken);

    const published = await providerRequest<{ id: string }>(
      this.key,
      'Publicação do contêiner do Instagram',
      {
        method: 'POST',
        url: `${graphBase()}/${igUserId}/media_publish`,
        data: new URLSearchParams({
          creation_id: containerId,
          access_token: accessToken,
        }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    return {
      externalPostId: published.id,
      status: 'PUBLISHED',
      platformResponse: { containerId, mediaId: published.id },
    };
  }

  private async waitForContainer(containerId: string, accessToken: string): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = await providerRequest<{
        status_code?: string;
        status?: string;
      }>(this.key, 'Consulta do status do contêiner do Instagram', {
        method: 'GET',
        url: `${graphBase()}/${containerId}`,
        params: { fields: 'status_code,status', access_token: accessToken },
      });
      const value = String(status.status_code || status.status || '').toUpperCase();
      if (value === 'FINISHED' || value === 'PUBLISHED') return;
      if (value === 'ERROR' || value === 'EXPIRED') {
        throw new Error(`O Instagram rejeitou a mídia (status ${value}). Verifique formato, proporção e URL pública.`);
      }
      await pollDelay(3000);
    }
    throw new Error('O Instagram não terminou de processar a mídia dentro do tempo esperado.');
  }
}
