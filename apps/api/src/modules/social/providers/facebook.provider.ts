import { SocialProviderKey } from '../../../common/constants/app.constants';
import { MediaPayload } from '../interfaces/social-provider.interface';
import {
  AuthorizationUrlInput,
  ExchangeCodeInput,
  OAuthAccountData,
  OAuthTokenSet,
  PublishContext,
  ProviderPublishResult,
  SocialProviderAdapter,
} from './provider.types';
import { envValue, providerRequest, secondsFromNow, splitScopes } from './http.util';

function graphBase(): string {
  const version = envValue('META_GRAPH_VERSION') || 'v26.0';
  return `https://graph.facebook.com/${version}`;
}

function dialogBase(): string {
  const version = envValue('META_GRAPH_VERSION') || 'v26.0';
  return `https://www.facebook.com/${version}/dialog/oauth`;
}

export class FacebookProvider implements SocialProviderAdapter {
  readonly key: SocialProviderKey = 'FACEBOOK';
  readonly label = 'Facebook';
  readonly docsUrl = 'https://developers.facebook.com/docs/pages-api';
  readonly scopes = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];
  readonly usesPkce = false;
  readonly mediaSupport = { text: true, image: true, video: true, carousel: true };
  readonly limitations = [
    'A API publica somente em Páginas do Facebook; perfis pessoais não são suportados pela Meta.',
    'Cada Página autorizada vira uma conta separada no Postaê, permitindo escolher destinos.',
    'O token da Página é derivado da autorização do usuário e pode ser invalidado a qualquer momento.',
    'Mídias precisam estar em URL pública acessível pela Meta.',
  ];
  readonly approvalNotes = [
    'A produção exige App Review para pages_show_list, pages_read_engagement e pages_manage_posts.',
    'Em modo de desenvolvimento, apenas administradores/testadores do app e Páginas que eles gerenciam podem autorizar.',
    'A Meta exige verificação de negócio para uso por clientes externos.',
  ];
  readonly requiredEnv = ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET'];

  isConfigured(): boolean {
    return Boolean(envValue('FACEBOOK_CLIENT_ID') && envValue('FACEBOOK_CLIENT_SECRET'));
  }

  getAuthorizationUrl(input: AuthorizationUrlInput): string {
    const params = new URLSearchParams({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(','),
      state: input.state,
    });
    return `${dialogBase()}?${params.toString()}`;
  }

  async exchangeCode(input: ExchangeCodeInput): Promise<OAuthTokenSet> {
    const shortLived = await providerRequest<{ access_token: string; expires_in?: number }>(
      this.key,
      'Troca do código OAuth do Facebook',
      {
        method: 'GET',
        url: `${graphBase()}/oauth/access_token`,
        params: {
          client_id: input.clientId,
          client_secret: input.clientSecret || '',
          redirect_uri: input.redirectUri,
          code: input.code,
        },
      },
    );

    const longLived = await providerRequest<{ access_token: string; expires_in?: number }>(
      this.key,
      'Obtenção do token de longa duração do Facebook',
      {
        method: 'GET',
        url: `${graphBase()}/oauth/access_token`,
        params: {
          grant_type: 'fb_exchange_token',
          client_id: input.clientId,
          client_secret: input.clientSecret || '',
          fb_exchange_token: shortLived.access_token,
        },
      },
    );

    return {
      accessToken: longLived.access_token,
      tokenExpiresAt: secondsFromNow(longLived.expires_in),
      scopes: this.scopes,
    };
  }

  async fetchAccounts(tokens: OAuthTokenSet): Promise<OAuthAccountData[]> {
    const result = await providerRequest<{
      data?: Array<{
        id: string;
        name: string;
        username?: string;
        access_token?: string;
        tasks?: string[];
        picture?: { data?: { url?: string } };
        instagram_business_account?: { id: string; username?: string };
      }>;
    }>(this.key, 'Consulta das Páginas do Facebook', {
      method: 'GET',
      url: `${graphBase()}/me/accounts`,
      params: {
        fields: 'id,name,username,access_token,tasks,picture{url},instagram_business_account{id,username}',
        limit: 100,
        access_token: tokens.accessToken,
      },
    });

    const pages = (result.data || []).filter((page) => page.access_token);
    if (!pages.length) {
      throw new Error(
        'Nenhuma Página do Facebook com permissão de publicação foi encontrada. Verifique se você é administrador da Página e autorizou pages_manage_posts.',
      );
    }

    return pages.map((page) => ({
      providerAccountId: page.id,
      displayName: page.name,
      username: page.username,
      avatarUrl: page.picture?.data?.url,
      accessToken: page.access_token as string,
      // Tokens de Página derivados de token de usuário de longa duração não têm
      // expiração fixa; podem ser invalidados se o usuário remover o app.
      tokenExpiresAt: undefined,
      scopes: this.scopes,
      metadata: {
        pageId: page.id,
        tasks: page.tasks ?? [],
        instagramBusinessAccount: page.instagram_business_account ?? null,
      },
    }));
  }

  async publish(context: PublishContext): Promise<ProviderPublishResult> {
    const pageId = context.account.providerAccountId;
    if (!pageId) throw new Error('Identificador da Página do Facebook ausente.');

    const accessToken = context.account.accessToken;
    const message = context.content.caption ?? context.content.text ?? '';
    const link = context.content.link;
    const media = context.media.filter((item) => item.url);
    const video = media.find((item) => item.kind === 'VIDEO');
    const images = media.filter((item) => item.kind === 'IMAGE');

    if (video) {
      const result = await providerRequest<{ id: string }>(this.key, 'Publicação de vídeo no Facebook', {
        method: 'POST',
        url: `${graphBase()}/${pageId}/videos`,
        data: new URLSearchParams({
          file_url: video.url,
          description: message,
          access_token: accessToken,
        }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return { externalPostId: result.id, status: 'PUBLISHED' };
    }

    if (images.length > 1) {
      const mediaIds: string[] = [];
      for (const image of images.slice(0, 10)) {
        const uploaded = await providerRequest<{ id: string }>(
          this.key,
          'Upload de foto para o Facebook',
          {
            method: 'POST',
            url: `${graphBase()}/${pageId}/photos`,
            data: new URLSearchParams({
              url: image.url,
              published: 'false',
              access_token: accessToken,
            }).toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        );
        mediaIds.push(uploaded.id);
      }
      const post = await providerRequest<{ id: string }>(this.key, 'Publicação de álbum no Facebook', {
        method: 'POST',
        url: `${graphBase()}/${pageId}/feed`,
        data: new URLSearchParams({
          message,
          attached_media: JSON.stringify(mediaIds.map((id) => ({ media_fbid: id }))),
          access_token: accessToken,
        }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return { externalPostId: post.id, status: 'PUBLISHED' };
    }

    if (images.length === 1) {
      const post = await providerRequest<{ id: string }>(this.key, 'Publicação de foto no Facebook', {
        method: 'POST',
        url: `${graphBase()}/${pageId}/photos`,
        data: new URLSearchParams({
          url: images[0].url,
          caption: message,
          access_token: accessToken,
        }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return { externalPostId: post.id, status: 'PUBLISHED' };
    }

    if (!message.trim()) {
      throw new Error('O Facebook exige texto, link ou mídia para publicar.');
    }

    const post = await providerRequest<{ id: string }>(this.key, 'Publicação de texto no Facebook', {
      method: 'POST',
      url: `${graphBase()}/${pageId}/feed`,
      data: new URLSearchParams({
        message,
        ...(link ? { link } : {}),
        access_token: accessToken,
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return { externalPostId: post.id, status: 'PUBLISHED' };
  }
}
