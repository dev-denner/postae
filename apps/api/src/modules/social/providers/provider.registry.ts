import { BadRequestException, Injectable } from '@nestjs/common';
import { SocialProviderKey, SOCIAL_PROVIDER } from '../../../common/constants/app.constants';
import { envValue } from './http.util';
import { FacebookProvider } from './facebook.provider';
import { InstagramProvider } from './instagram.provider';
import { ThreadsProvider } from './threads.provider';
import { TikTokProvider } from './tiktok.provider';
import { XProvider } from './x.provider';
import { YouTubeProvider } from './youtube.provider';
import { ProviderPublicInfo, SocialProviderAdapter } from './provider.types';

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret?: string;
}

@Injectable()
export class SocialProviderRegistry {
  private readonly providers = new Map<SocialProviderKey, SocialProviderAdapter>();

  constructor() {
    for (const provider of [
      new InstagramProvider(),
      new FacebookProvider(),
      new ThreadsProvider(),
      new XProvider(),
      new TikTokProvider(),
      new YouTubeProvider(),
    ]) {
      this.providers.set(provider.key, provider);
    }
  }

  all(): SocialProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  get(provider: string): SocialProviderAdapter {
    const key = provider.toUpperCase() as SocialProviderKey;
    const adapter = this.providers.get(key);
    if (!adapter) {
      throw new BadRequestException(`Rede social não suportada: ${provider}`);
    }
    return adapter;
  }

  isSupported(provider: string): provider is SocialProviderKey {
    return Object.prototype.hasOwnProperty.call(SOCIAL_PROVIDER, provider.toUpperCase());
  }

  publicInfo(): ProviderPublicInfo[] {
    return this.all().map((provider) => ({
      key: provider.key,
      label: provider.label,
      docsUrl: provider.docsUrl,
      scopes: provider.scopes,
      usesPkce: provider.usesPkce,
      configured: provider.isConfigured(),
      requiredEnv: provider.requiredEnv,
      mediaSupport: provider.mediaSupport,
      limitations: provider.limitations,
      approvalNotes: provider.approvalNotes,
    }));
  }

  credentialsFor(provider: SocialProviderKey): OAuthClientCredentials {
    const adapter = this.get(provider);
    if (!adapter.isConfigured()) {
      throw new BadRequestException(
        `${adapter.label} ainda não está configurado. Defina ${adapter.requiredEnv.join(' e ')} no ambiente da API.`,
      );
    }

    switch (provider) {
      case 'INSTAGRAM':
        return {
          clientId: envValue('INSTAGRAM_CLIENT_ID') as string,
          clientSecret: envValue('INSTAGRAM_CLIENT_SECRET'),
        };
      case 'FACEBOOK':
        return {
          clientId: envValue('FACEBOOK_CLIENT_ID') as string,
          clientSecret: envValue('FACEBOOK_CLIENT_SECRET'),
        };
      case 'THREADS':
        return {
          clientId: envValue('THREADS_CLIENT_ID') as string,
          clientSecret: envValue('THREADS_CLIENT_SECRET'),
        };
      case 'TWITTER':
        return {
          clientId: envValue('X_CLIENT_ID') as string,
          clientSecret: envValue('X_CLIENT_SECRET'),
        };
      case 'TIKTOK':
        return {
          clientId: envValue('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_ID') as string,
          clientSecret: envValue('TIKTOK_CLIENT_SECRET'),
        };
      case 'YOUTUBE':
        return {
          clientId: envValue('YOUTUBE_CLIENT_ID') as string,
          clientSecret: envValue('YOUTUBE_CLIENT_SECRET'),
        };
      default:
        throw new BadRequestException(`Rede social não suportada: ${provider}`);
    }
  }
}
