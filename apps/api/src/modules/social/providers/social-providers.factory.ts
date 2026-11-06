import { SocialProviderKey } from '../../../common/constants/app.constants';
import { BaseMockSocialProvider } from './base.mock-provider';

export class InstagramProvider extends BaseMockSocialProvider {
  readonly platform: SocialProviderKey = 'INSTAGRAM';
  constructor() {
    super('instagram-api');
  }
}

export class FacebookProvider extends BaseMockSocialProvider {
  readonly platform: SocialProviderKey = 'FACEBOOK';
  constructor() {
    super('facebook-api');
  }
}

export class ThreadsProvider extends BaseMockSocialProvider {
  readonly platform: SocialProviderKey = 'THREADS';
  constructor() {
    super('threads-api');
  }
}

export class TwitterProvider extends BaseMockSocialProvider {
  readonly platform: SocialProviderKey = 'TWITTER';
  constructor() {
    super('twitter-api');
  }
}

export class TikTokProvider extends BaseMockSocialProvider {
  readonly platform: SocialProviderKey = 'TIKTOK';
  constructor() {
    super('tiktok-api');
  }
}

export class YoutubeProvider extends BaseMockSocialProvider {
  readonly platform: SocialProviderKey = 'YOUTUBE';
  constructor() {
    super('youtube-api');
  }
}

export type MockSocialProviderClass = new () => BaseMockSocialProvider;

export const MOCK_PROVIDER_FACTORIES: Record<
  SocialProviderKey,
  MockSocialProviderClass
> = {
  INSTAGRAM: InstagramProvider,
  FACEBOOK: FacebookProvider,
  THREADS: ThreadsProvider,
  TWITTER: TwitterProvider,
  TIKTOK: TikTokProvider,
  YOUTUBE: YoutubeProvider,
};
