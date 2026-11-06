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
import {
  envValue,
  fileNameForUpload,
  providerRequest,
  readMediaBytes,
  secondsFromNow,
  splitScopes,
  truncate,
} from './http.util';

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const REVOKE_URL = 'https://api.x.com/2/oauth2/revoke';

export class XProvider implements SocialProviderAdapter {
  readonly key: SocialProviderKey = 'TWITTER';
  readonly label = 'X';
  readonly docsUrl = 'https://docs.x.com/x-api/posts/create-post';
  readonly scopes = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'];
  readonly usesPkce = true;
  readonly mediaSupport = { text: true, image: true, video: false, carousel: false };
  readonly limitations = [
    'Publicação exige acesso pago/créditos à API do X; os limites e preços são definidos pelo X.',
    'Texto limitado a 280 caracteres; até 4 imagens por post.',
    'Upload de vídeo não está habilitado nesta versão; use texto ou imagens.',
    'O access token dura cerca de 2 horas; o refresh token exige o escopo offline.access.',
  ];
  readonly approvalNotes = [
    'É necessário ter uma conta de desenvolvedor aprovada e um App com OAuth 2.0 habilitado no X Developer Console.',
    'O App precisa ter permissão de leitura e escrita e a URL de callback deve bater exatamente.',
    'O plano/uso da API é cobrado pelo X conforme a tabela vigente.',
  ];
  readonly requiredEnv = ['X_CLIENT_ID', 'X_CLIENT_SECRET (opcional para cliente público)'];

  isConfigured(): boolean {
    return Boolean(envValue('X_CLIENT_ID'));
  }

  getAuthorizationUrl(input: AuthorizationUrlInput): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      scope: this.scopes.join(' '),
      state: input.state,
      code_challenge: input.codeChallenge || '',
      code_challenge_method: 'S256',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(input: ExchangeCodeInput): Promise<OAuthTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier || '',
      ...(input.clientSecret ? {} : { client_id: input.clientId }),
    });

    const result = await providerRequest<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(this.key, 'Troca do código OAuth do X', {
      method: 'POST',
      url: TOKEN_URL,
      data: body.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(input.clientSecret
          ? { Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64')}` }
          : {}),
      },
    });

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      tokenExpiresAt: secondsFromNow(result.expires_in) || secondsFromNow(2 * 60 * 60),
      scopes: splitScopes(result.scope),
    };
  }

  async refreshTokens(input: RefreshTokenInput): Promise<OAuthTokenSet> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
      ...(input.clientSecret ? {} : { client_id: input.clientId }),
    });
    const result = await providerRequest<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(this.key, 'Renovação do token do X', {
      method: 'POST',
      url: TOKEN_URL,
      data: body.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(input.clientSecret
          ? { Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64')}` }
          : {}),
      },
    });

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      tokenExpiresAt: secondsFromNow(result.expires_in) || secondsFromNow(2 * 60 * 60),
      scopes: splitScopes(result.scope),
    };
  }

  async fetchAccounts(tokens: OAuthTokenSet): Promise<OAuthAccountData[]> {
    const result = await providerRequest<{
      data: {
        id: string;
        name: string;
        username: string;
        profile_image_url?: string;
      };
    }>(this.key, 'Consulta do perfil do X', {
      method: 'GET',
      url: 'https://api.x.com/2/users/me',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      params: { 'user.fields': 'profile_image_url,username,name' },
    });

    return [
      {
        providerAccountId: result.data.id,
        displayName: result.data.name || result.data.username,
        username: result.data.username,
        avatarUrl: result.data.profile_image_url,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        scopes: tokens.scopes?.length ? tokens.scopes : this.scopes,
        metadata: { xUserId: result.data.id },
      },
    ];
  }

  async publish(context: PublishContext): Promise<ProviderPublishResult> {
    const text = truncate(
      context.content.caption ?? context.content.text ?? '',
      context.content.link ? 280 : 280,
    );
    const media = context.media.filter((item) => item.url);
    if (!text.trim() && !media.length) {
      throw new Error('O X exige texto ou mídia para publicar.');
    }
    if (media.some((item) => item.kind === 'VIDEO')) {
      throw new Error('Publicação de vídeo no X ainda não está habilitada nesta versão.');
    }

    const mediaIds: string[] = [];
    for (const item of media.slice(0, 4)) {
      mediaIds.push(await this.uploadImage(item, context.account.accessToken));
    }

    const body: Record<string, unknown> = { text };
    if (mediaIds.length) body.media = { media_ids: mediaIds };

    const result = await providerRequest<{ data: { id: string } }>(
      this.key,
      'Criação da publicação no X',
      {
        method: 'POST',
        url: 'https://api.x.com/2/tweets',
        headers: {
          Authorization: `Bearer ${context.account.accessToken}`,
          'Content-Type': 'application/json',
        },
        data: body,
      },
    );

    return {
      externalPostId: result.data.id,
      status: 'PUBLISHED',
      platformResponse: { tweetId: result.data.id },
    };
  }

  async revoke(tokens: OAuthTokenSet): Promise<void> {
    const clientId = envValue('X_CLIENT_ID');
    if (!clientId) return;
    await providerRequest(this.key, 'Revogação do token do X', {
      method: 'POST',
      url: REVOKE_URL,
      data: new URLSearchParams({
        token: tokens.accessToken,
        client_id: clientId,
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => undefined);
  }

  private async uploadImage(item: MediaPayload, accessToken: string): Promise<string> {
    const { buffer, filename } = await readMediaBytes(this.key, item);
    const form = new FormData();
    form.append(
      'media',
      new Blob([new Uint8Array(buffer)], { type: item.mimeType || 'image/jpeg' }),
      fileNameForUpload(filename, item.mimeType || 'image/jpeg', 'media.jpg'),
    );
    form.append('media_category', 'tweet_image');
    form.append('media_type', item.mimeType || 'image/jpeg');

    const uploaded = await providerRequest<{
      data?: { id?: string; media_id_string?: string; media_id?: string };
      media_id_string?: string;
      id?: string;
    }>(this.key, 'Upload de imagem para o X', {
      method: 'POST',
      url: 'https://api.x.com/2/media/upload',
      headers: { Authorization: `Bearer ${accessToken}` },
      data: form,
    });

    const mediaId =
      uploaded.data?.media_id_string ||
      uploaded.data?.id ||
      uploaded.data?.media_id ||
      uploaded.media_id_string ||
      uploaded.id;
    if (!mediaId) throw new Error('O X não retornou o identificador da mídia enviada.');
    return String(mediaId);
  }
}
