import { SocialProviderKey } from '../../../common/constants/app.constants';

export interface PostContent {
  text?: string;
  caption?: string;
  title?: string;
  hashtags?: string[];
  link?: string;
  cta?: string;
}

export interface MediaPayload {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface PublishInput {
  platform: SocialProviderKey;
  postId: string;
  content: PostContent;
  media: MediaPayload[];
  publishAt: Date;
}

export interface PublishResult {
  externalPostId: string;
  status: 'PUBLISHED' | 'FAILED';
  platformResponse?: unknown;
}

export interface SocialProvider {
  readonly platform: SocialProviderKey;
  publish(input: PublishInput): Promise<PublishResult>;
  schedule?(input: PublishInput): Promise<void>;
  delete(postId: string): Promise<void>;
  getStatus(postId: string): Promise<'PUBLISHED' | 'FAILED' | 'NOT_FOUND'>;
}
