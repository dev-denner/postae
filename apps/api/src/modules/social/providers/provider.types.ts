import { SocialProviderKey } from '../../../common/constants/app.constants';
import { MediaPayload, PostContent } from '../interfaces/social-provider.interface';

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface OAuthAccountData {
  providerAccountId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface AuthorizationUrlInput {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}

export interface ExchangeCodeInput {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  code: string;
  codeVerifier?: string;
}

export interface RefreshTokenInput {
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}

export interface PublishAccount {
  id: string;
  providerAccountId: string | null;
  displayName: string | null;
  username: string | null;
  accessToken: string;
  metadata?: Record<string, unknown> | null;
}

export interface PublishContext {
  account: PublishAccount;
  content: PostContent;
  media: MediaPayload[];
  publishAt: Date;
}

export interface ProviderPublishResult {
  externalPostId: string;
  status: 'PUBLISHED' | 'FAILED';
  warning?: string;
  platformResponse?: unknown;
}

export interface ProviderMediaSupport {
  text: boolean;
  image: boolean;
  video: boolean;
  carousel: boolean;
}

export interface SocialProviderAdapter {
  readonly key: SocialProviderKey;
  readonly label: string;
  readonly docsUrl: string;
  readonly scopes: string[];
  readonly usesPkce: boolean;
  readonly mediaSupport: ProviderMediaSupport;
  readonly limitations: string[];
  readonly approvalNotes: string[];
  readonly requiredEnv: string[];
  isConfigured(): boolean;
  getAuthorizationUrl(input: AuthorizationUrlInput): string;
  exchangeCode(input: ExchangeCodeInput): Promise<OAuthTokenSet>;
  refreshTokens?(input: RefreshTokenInput): Promise<OAuthTokenSet>;
  fetchAccounts(tokens: OAuthTokenSet): Promise<OAuthAccountData[]>;
  publish(context: PublishContext): Promise<ProviderPublishResult>;
  revoke?(tokens: OAuthTokenSet): Promise<void>;
}

export interface ProviderPublicInfo {
  key: SocialProviderKey;
  label: string;
  docsUrl: string;
  scopes: string[];
  usesPkce: boolean;
  configured: boolean;
  requiredEnv: string[];
  mediaSupport: ProviderMediaSupport;
  limitations: string[];
  approvalNotes: string[];
}
