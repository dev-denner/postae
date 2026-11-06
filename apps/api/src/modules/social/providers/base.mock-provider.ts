import { SocialProvider, PublishInput, PublishResult } from '../interfaces/social-provider.interface';
import { SocialProviderKey } from '../../../common/constants/app.constants';

export abstract class BaseMockSocialProvider implements SocialProvider {
  abstract readonly platform: SocialProviderKey;

  constructor(protected readonly name: string) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    // Simula latência de rede
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 300));
    return {
      externalPostId: `${this.platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'PUBLISHED',
      platformResponse: { mock: true, input },
    };
  }

  async schedule(_input: PublishInput): Promise<void> {
    await new Promise((r) => setTimeout(r, 80));
  }

  async delete(_postId: string): Promise<void> {}

  async getStatus(_postId: string): Promise<'PUBLISHED' | 'FAILED' | 'NOT_FOUND'> {
    return 'PUBLISHED';
  }
}
