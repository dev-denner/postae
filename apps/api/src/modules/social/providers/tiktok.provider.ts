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
  readMediaBytes,
  requirePublicMediaUrl,
  secondsFromNow,
  splitScopes,
  truncate,
} from './http.util';

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
const API_BASE = 'https://open.tiktokapis.com/v2';

function pollDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TikTokProvider implements SocialProviderAdapter {
  readonly key: SocialProviderKey = 'TIKTOK';
  readonly label = 'TikTok';
  readonly docsUrl = 'https://developers.tiktok.com/doc/content-posting-api-get-started';
  readonly scopes = ['user.info.basic', 'video.publish'];
  readonly usesPkce = true;
  readonly mediaSupport = { text: false, image: false, video: true, carousel: false };
  readonly limitations = [
    'A API de publicação do TikTok aceita vídeo; fotos ainda não estão habilitadas nesta versão.',
    'O vídeo pode ser enviado diretamente (FILE_UPLOAD) ou por URL pública verificada (PULL_FROM_URL).',
    'Enquanto o app não passa pela auditoria do TikTok, publicações ficam em SELF_ONLY (somente o criador vê) e a conta precisa ser privada.',
    'Há limites de posts por criador em 24h (tipicamente cerca de 15) e limite de criadores ativos por app.',
    'O access token dura cerca de 2 horas e o refresh token cerca de 180 dias, com rotação a cada renovação.',
  ];
  readonly approvalNotes = [
    'É necessário registrar um app no TikTok for Developers, adicionar o produto Content Posting API e ser aprovado para o escopo video.publish.',
    'Publicação pública exige auditoria de conformidade do cliente (Content Posting API audit).',
    'A verificação de propriedade da URL só é necessária ao usar PULL_FROM_URL; uploads locais usam FILE_UPLOAD.',
  ];
  readonly requiredEnv = ['TIKTOK_CLIENT_KEY (ou TIKTOK_CLIENT_ID)', 'TIKTOK_CLIENT_SECRET'];

  private clientKey(): string | undefined {
    return envValue('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_ID');
  }

  isConfigured(): boolean {
    return Boolean(this.clientKey() && envValue('TIKTOK_CLIENT_SECRET'));
  }

  getAuthorizationUrl(input: AuthorizationUrlInput): string {
    const params = new URLSearchParams({
      client_key: input.clientId,
      scope: this.scopes.join(','),
      response_type: 'code',
      redirect_uri: input.redirectUri,
      state: input.state,
      code_challenge: input.codeChallenge || '',
      code_challenge_method: 'S256',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(input: ExchangeCodeInput): Promise<OAuthTokenSet> {
    const result = await providerRequest<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      open_id?: string;
      scope?: string;
      token_type?: string;
    }>(this.key, 'Troca do código OAuth do TikTok', {
      method: 'POST',
      url: TOKEN_URL,
      data: new URLSearchParams({
        client_key: input.clientId,
        client_secret: input.clientSecret || '',
        code: input.code,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier || '',
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      tokenExpiresAt: secondsFromNow(result.expires_in),
      refreshTokenExpiresAt: secondsFromNow(result.refresh_expires_in),
      scopes: splitScopes(result.scope),
      metadata: { openId: result.open_id },
    };
  }

  async refreshTokens(input: RefreshTokenInput): Promise<OAuthTokenSet> {
    const result = await providerRequest<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      open_id?: string;
      scope?: string;
    }>(this.key, 'Renovação do token do TikTok', {
      method: 'POST',
      url: TOKEN_URL,
      data: new URLSearchParams({
        client_key: input.clientId,
        client_secret: input.clientSecret || '',
        grant_type: 'refresh_token',
        refresh_token: input.refreshToken,
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      tokenExpiresAt: secondsFromNow(result.expires_in),
      refreshTokenExpiresAt: secondsFromNow(result.refresh_expires_in),
      scopes: splitScopes(result.scope),
      metadata: { openId: result.open_id },
    };
  }

  async fetchAccounts(tokens: OAuthTokenSet): Promise<OAuthAccountData[]> {
    const result = await providerRequest<{
      data?: {
        user?: {
          open_id: string;
          union_id?: string;
          avatar_url?: string;
          display_name?: string;
          username?: string;
        };
      };
      error?: { code?: string; message?: string };
    }>(this.key, 'Consulta do perfil do TikTok', {
      method: 'GET',
      url: `${API_BASE}/user/info/`,
      params: { fields: 'open_id,union_id,avatar_url,display_name,username' },
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    const user = result.data?.user;
    if (!user?.open_id) {
      throw new Error('A API do TikTok não retornou o identificador da conta.');
    }

    return [
      {
        providerAccountId: user.open_id,
        displayName: user.display_name || user.username || 'TikTok',
        username: user.username,
        avatarUrl: user.avatar_url,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        scopes: tokens.scopes?.length ? tokens.scopes : this.scopes,
        metadata: { openId: user.open_id, unionId: user.union_id, ...(tokens.metadata || {}) },
      },
    ];
  }

  async publish(context: PublishContext): Promise<ProviderPublishResult> {
    const video = context.media.find((item) => item.kind === 'VIDEO' && item.url);
    if (!video) {
      throw new Error('O TikTok exige um vídeo para publicar. Selecione uma mídia do tipo vídeo.');
    }

    const accessToken = context.account.accessToken;
    const creator = await providerRequest<{
      data: {
        creator_username?: string;
        creator_nickname?: string;
        privacy_level_options?: string[];
        max_video_post_duration_sec?: number;
      };
    }>(this.key, 'Consulta das opções do criador no TikTok', {
      method: 'POST',
      url: `${API_BASE}/post/publish/creator_info/query/`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      data: {},
    });

    const options = creator.data?.privacy_level_options || [];
    const privacyLevel = options.includes('PUBLIC_TO_EVERYONE')
      ? 'PUBLIC_TO_EVERYONE'
      : options.includes('SELF_ONLY')
        ? 'SELF_ONLY'
        : options[0];

    if (!privacyLevel) {
      throw new Error('O TikTok não retornou níveis de privacidade permitidos para esta conta.');
    }

    const warning =
      privacyLevel !== 'PUBLIC_TO_EVERYONE'
        ? 'O TikTok publicou como SELF_ONLY/privado porque o app ainda não foi auditado ou a conta não permite publicação pública.'
        : undefined;

    const title = truncate(
      context.content.caption ?? context.content.text ?? '',
      2200,
    );

    // Upload direto oficial (FILE_UPLOAD) quando a mídia veio do nosso storage.
    // Para mídia externa, mantém PULL_FROM_URL (exige domínio verificado).
    let videoBytes: Buffer | undefined;
    let chunkSize = 0;
    let totalChunkCount = 0;
    let sourceInfo: Record<string, unknown>;
    if (video.filePath) {
      videoBytes = (await readMediaBytes(this.key, video)).buffer;
      const size = videoBytes.length;
      const fiveMb = 5 * 1024 * 1024;
      chunkSize = size < fiveMb ? size : Math.min(10 * 1024 * 1024, size);
      totalChunkCount = Math.max(1, Math.ceil(size / chunkSize));
      sourceInfo = {
        source: 'FILE_UPLOAD',
        video_size: size,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      };
    } else {
      sourceInfo = {
        source: 'PULL_FROM_URL',
        video_url: requirePublicMediaUrl(video, 'TikTok'),
      };
    }

    const initialized = await providerRequest<{
      data?: { publish_id?: string; upload_url?: string };
      error?: { code?: string; message?: string };
    }>(this.key, 'Inicialização da publicação no TikTok', {
      method: 'POST',
      url: `${API_BASE}/post/publish/video/init/`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      data: {
        post_info: {
          title,
          privacy_level: privacyLevel,
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: sourceInfo,
      },
    });

    const publishId = initialized.data?.publish_id;
    if (!publishId) {
      throw new Error(
        initialized.error?.message ||
          'O TikTok não retornou o identificador da publicação. Verifique as permissões e o formato do vídeo.',
      );
    }

    if (videoBytes) {
      const uploadUrl = initialized.data?.upload_url;
      if (!uploadUrl) {
        throw new Error('O TikTok não retornou a URL de upload do vídeo.');
      }
      await this.uploadChunks(
        uploadUrl,
        videoBytes,
        chunkSize,
        totalChunkCount,
        video.mimeType || 'video/mp4',
      );
    }

    const externalPostId = await this.waitForPublish(publishId, accessToken);

    return {
      externalPostId,
      status: 'PUBLISHED',
      warning,
      platformResponse: { publishId, privacyLevel },
    };
  }

  async revoke(tokens: OAuthTokenSet): Promise<void> {
    if (!this.isConfigured()) return;
    await providerRequest(this.key, 'Revogação do token do TikTok', {
      method: 'POST',
      url: REVOKE_URL,
      data: new URLSearchParams({
        client_key: this.clientKey() || '',
        client_secret: envValue('TIKTOK_CLIENT_SECRET') || '',
        token: tokens.accessToken,
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => undefined);
  }

  private async uploadChunks(
    uploadUrl: string,
    buffer: Buffer,
    chunkSize: number,
    totalChunks: number,
    mimeType: string,
  ): Promise<void> {
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * chunkSize;
      const end = Math.min(start + chunkSize, buffer.length) - 1;
      const chunk = buffer.subarray(start, end + 1);
      await providerRequestRaw(
        this.key,
        `Envio do bloco ${index + 1}/${totalChunks} ao TikTok`,
        {
          method: 'PUT',
          url: uploadUrl,
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
          },
          data: chunk,
          timeout: 180_000,
          maxBodyLength: Infinity,
        },
      );
    }
  }

  private async waitForPublish(publishId: string, accessToken: string): Promise<string> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const status = await providerRequest<{
        data?: {
          status?: string;
          fail_reason?: string;
          publicaly_available_post_id?: string[] | string;
          post_id?: string;
        };
      }>(this.key, 'Consulta do status da publicação no TikTok', {
        method: 'POST',
        url: `${API_BASE}/post/publish/status/fetch/`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        data: { publish_id: publishId },
      });

      const value = String(status.data?.status || '').toUpperCase();
      if (value === 'PUBLISH_COMPLETE') {
        const ids = status.data?.publicaly_available_post_id;
        const id = Array.isArray(ids) ? ids[0] : ids;
        return id || status.data?.post_id || publishId;
      }
      if (value === 'FAILED') {
        throw new Error(
          `O TikTok falhou ao publicar${status.data?.fail_reason ? `: ${status.data.fail_reason}` : '.'}`,
        );
      }
      await pollDelay(3000);
    }
    throw new Error(
      'O TikTok ainda está processando o vídeo. A publicação pode aparecer na conta em alguns minutos.',
    );
  }
}
