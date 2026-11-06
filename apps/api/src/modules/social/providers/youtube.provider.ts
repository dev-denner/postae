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
import {
  envValue,
  providerRequest,
  providerRequestRaw,
  secondsFromNow,
  splitScopes,
  truncate,
} from './http.util';
import { assertSafePublicUrl } from '../../../common/utils/url-safety.util';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';

export class YouTubeProvider implements SocialProviderAdapter {
  readonly key: SocialProviderKey = 'YOUTUBE';
  readonly label = 'YouTube';
  readonly docsUrl = 'https://developers.google.com/youtube/v3/docs/videos/insert';
  readonly scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
  ];
  readonly usesPkce = false;
  readonly mediaSupport = { text: false, image: false, video: true, carousel: false };
  readonly limitations = [
    'A API do YouTube exige vídeo; texto e imagens isoladas não são suportados.',
    'O título do vídeo é limitado a 100 caracteres e a descrição a 5.000.',
    'A cota padrão permite 100 chamadas de videos.insert por dia (uma por upload).',
    'Vídeos enviados por projetos de API não verificados não são mais forçados a privado desde novembro/2026, mas a verificação OAuth ainda é necessária para uso por usuários externos.',
    'Shorts são detectados pelo próprio YouTube a partir do formato do vídeo; não há endpoint separado nesta versão.',
  ];
  readonly approvalNotes = [
    'É necessário um projeto no Google Cloud com YouTube Data API v3 habilitada e tela de consentimento OAuth configurada.',
    'Os escopos youtube.upload e youtube.readonly são sensíveis: usuários externos exigem verificação do app pelo Google.',
    'Em modo de teste, somente contas de teste cadastradas conseguem autorizar.',
    'Aumento de cota exige auditoria de conformidade do YouTube.',
  ];
  readonly requiredEnv = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'];

  isConfigured(): boolean {
    return Boolean(envValue('YOUTUBE_CLIENT_ID') && envValue('YOUTUBE_CLIENT_SECRET'));
  }

  getAuthorizationUrl(input: AuthorizationUrlInput): string {
    const params = new URLSearchParams({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: input.state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(input: ExchangeCodeInput): Promise<OAuthTokenSet> {
    const result = await providerRequest<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(this.key, 'Troca do código OAuth do YouTube', {
      method: 'POST',
      url: TOKEN_URL,
      data: new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret || '',
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      tokenExpiresAt: secondsFromNow(result.expires_in),
      scopes: splitScopes(result.scope),
    };
  }

  async refreshTokens(input: RefreshTokenInput): Promise<OAuthTokenSet> {
    const result = await providerRequest<{
      access_token: string;
      expires_in?: number;
      scope?: string;
      refresh_token?: string;
    }>(this.key, 'Renovação do token do YouTube', {
      method: 'POST',
      url: TOKEN_URL,
      data: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret || '',
        refresh_token: input.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return {
      accessToken: result.access_token,
      // O Google normalmente não rotaciona o refresh token.
      refreshToken: result.refresh_token || input.refreshToken,
      tokenExpiresAt: secondsFromNow(result.expires_in),
      scopes: splitScopes(result.scope),
    };
  }

  async fetchAccounts(tokens: OAuthTokenSet): Promise<OAuthAccountData[]> {
    const result = await providerRequest<{
      items?: Array<{
        id: string;
        snippet?: {
          title?: string;
          customUrl?: string;
          thumbnails?: { default?: { url?: string } };
        };
      }>;
    }>(this.key, 'Consulta do canal do YouTube', {
      method: 'GET',
      url: `${YOUTUBE_API}/channels`,
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      params: { part: 'snippet', mine: 'true' },
    });

    const channel = result.items?.[0];
    if (!channel) {
      throw new Error('Nenhum canal do YouTube foi encontrado para esta conta Google.');
    }

    return [
      {
        providerAccountId: channel.id,
        displayName: channel.snippet?.title || 'YouTube',
        username: channel.snippet?.customUrl,
        avatarUrl: channel.snippet?.thumbnails?.default?.url,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        scopes: tokens.scopes?.length ? tokens.scopes : this.scopes,
        metadata: { channelId: channel.id, customUrl: channel.snippet?.customUrl ?? null },
      },
    ];
  }

  async publish(context: PublishContext): Promise<ProviderPublishResult> {
    const video = context.media.find((item) => item.kind === 'VIDEO' && item.url);
    if (!video) {
      throw new Error('O YouTube exige um vídeo para publicar. Selecione uma mídia do tipo vídeo.');
    }

    const accessToken = context.account.accessToken;
    const caption = context.content.caption ?? context.content.text ?? '';
    const title = truncate(context.content.title || caption.split('\n')[0] || 'Publicação', 100);

    await assertSafePublicUrl(video.url);
    const videoBytes = await providerRequest<ArrayBuffer>(this.key, 'Download do vídeo para o YouTube', {
      method: 'GET',
      url: video.url,
      responseType: 'arraybuffer',
    });

    const init = await providerRequestRaw<unknown>(this.key, 'Inicialização do upload no YouTube', {
      method: 'POST',
      url: UPLOAD_URL,
      params: { uploadType: 'resumable', part: 'snippet,status' },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': video.mimeType || 'video/mp4',
        'X-Upload-Content-Length': String(Buffer.byteLength(Buffer.from(videoBytes))),
      },
      data: {
        snippet: {
          title,
          description: truncate(caption, 5000),
          categoryId: '22',
        },
        status: {
          privacyStatus: envValue('YOUTUBE_PRIVACY_STATUS') || 'public',
          selfDeclaredMadeForKids: false,
        },
      },
    });

    const uploadUrl = init.headers?.location;
    if (!uploadUrl) {
      throw new Error('O YouTube não retornou a URL de upload do vídeo.');
    }

    const uploaded = await providerRequest<{ id: string }>(this.key, 'Upload do vídeo para o YouTube', {
      method: 'PUT',
      url: String(uploadUrl),
      headers: {
        'Content-Type': video.mimeType || 'video/mp4',
        'Content-Length': String(Buffer.byteLength(Buffer.from(videoBytes))),
      },
      data: Buffer.from(videoBytes),
    });

    return {
      externalPostId: uploaded.id,
      status: 'PUBLISHED',
      platformResponse: { videoId: uploaded.id, title },
    };
  }

  async revoke(tokens: OAuthTokenSet): Promise<void> {
    await providerRequest(this.key, 'Revogação do token do YouTube', {
      method: 'POST',
      url: REVOKE_URL,
      params: { token: tokens.accessToken },
    }).catch(() => undefined);
  }
}
