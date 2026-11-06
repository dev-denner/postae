export type ProviderKey =
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'THREADS'
  | 'TWITTER'
  | 'TIKTOK'
  | 'YOUTUBE';

export interface ProviderMediaSupport {
  text: boolean;
  image: boolean;
  video: boolean;
  carousel: boolean;
}

export interface SocialProviderInfo {
  key: ProviderKey;
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

export interface SocialAccount {
  id: string;
  provider: ProviderKey;
  providerAccountId?: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  status: string;
  connectionState: 'CONNECTED' | 'REFRESH_REQUIRED' | 'EXPIRED' | 'REVOKED' | 'DISCONNECTED';
  canPublish: boolean;
  needsReconnect: boolean;
  tokenExpiresAt?: string;
  tokenExpiresInSeconds?: number;
  refreshTokenExpiresAt?: string;
  scopes: string[];
  lastError?: string;
  lastSyncedAt?: string;
  connectedAt: string;
}

export type PostStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'PUBLISHED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type DestinationStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'SKIPPED';

export interface PostDestination {
  id: string;
  postId: string;
  socialAccountId: string | null;
  provider: ProviderKey;
  accountDisplayName: string;
  accountUsername?: string | null;
  status: DestinationStatus;
  externalPostId?: string | null;
  error?: string | null;
  warning?: string | null;
  attempts: number;
  publishedAt?: string | null;
  socialAccount?: Partial<SocialAccount> | null;
}

export interface PostMedia {
  media: {
    id: string;
    kind: 'IMAGE' | 'VIDEO';
    url: string;
    mimeType: string;
    width?: number;
    height?: number;
    durationSec?: number;
    sizeBytes?: number;
  };
}

export interface PostLog {
  id: string;
  destinationId?: string | null;
  provider: string;
  status: string;
  externalPostId?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface PostRecord {
  id: string;
  workspaceId: string;
  status: PostStatus;
  publishAt?: string | null;
  publishedAt?: string | null;
  failureReason?: string | null;
  content?: {
    title?: string;
    text?: string;
    caption?: string;
    hashtags?: string[];
    link?: string;
    cta?: string;
  } | null;
  media?: PostMedia[];
  mediaIds?: string[];
  destinations: PostDestination[];
  logs?: PostLog[];
  createdAt: string;
  updatedAt: string;
}

export const PROVIDER_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  THREADS: 'Threads',
  TWITTER: 'X',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
};

export const PROVIDER_ORDER: ProviderKey[] = [
  'INSTAGRAM',
  'FACEBOOK',
  'THREADS',
  'TWITTER',
  'TIKTOK',
  'YOUTUBE',
];

export const POST_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  PUBLISHED: {
    label: 'Publicado',
    className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  },
  PARTIAL: {
    label: 'Parcial',
    className: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  },
  SCHEDULED: {
    label: 'Agendado',
    className: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  },
  PROCESSING: {
    label: 'Processando',
    className: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  },
  FAILED: {
    label: 'Falhou',
    className: 'bg-red-500/15 text-red-500 border-red-500/30',
  },
  DRAFT: {
    label: 'Rascunho',
    className: 'bg-muted text-muted-foreground border-border',
  },
  CANCELLED: {
    label: 'Cancelado',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export const DESTINATION_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  PENDING: { label: 'Pendente', className: 'bg-muted text-muted-foreground' },
  PROCESSING: { label: 'Publicando', className: 'bg-amber-500/15 text-amber-500' },
  PUBLISHED: { label: 'Publicado', className: 'bg-emerald-500/15 text-emerald-500' },
  FAILED: { label: 'Falhou', className: 'bg-red-500/15 text-red-500' },
  SKIPPED: { label: 'Ignorado', className: 'bg-muted text-muted-foreground' },
};

export function providerLabel(provider?: string | null): string {
  return (provider && PROVIDER_LABELS[provider]) || provider || 'Rede social';
}

export function accountHandle(account: { displayName?: string; username?: string }): string {
  if (account.username) return account.username.startsWith('@') ? account.username : `@${account.username}`;
  return account.displayName || '';
}

export function tokenExpiryLabel(account: SocialAccount): string {
  if (!account.tokenExpiresAt) {
    return 'Sem expiração fixa';
  }
  const seconds = account.tokenExpiresInSeconds ?? 0;
  if (seconds <= 0) return 'Token expirado';
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `Expira em ${days} dia${days === 1 ? '' : 's'}`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `Expira em ${hours}h`;
  return `Expira em ${Math.max(1, Math.floor(seconds / 60))} min`;
}

export function postTitle(post: PostRecord): string {
  const content = post.content || {};
  return content.title || content.text || content.caption || 'Sem título';
}

export function canEditPost(post: PostRecord): boolean {
  return ['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELLED'].includes(post.status);
}
