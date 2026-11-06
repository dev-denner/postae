export const PLATFORMS = [
  { key: 'INSTAGRAM', label: 'Instagram', supports: ['FEED', 'CAROUSEL', 'REELS', 'STORIES'], defaultSelected: true, selected: true },
  { key: 'FACEBOOK', label: 'Facebook', supports: ['FEED', 'CAROUSEL', 'VIDEOS', 'REELS'], defaultSelected: true, selected: true },
  { key: 'THREADS', label: 'Threads', supports: ['TEXT', 'IMAGES', 'VIDEOS'], defaultSelected: true, selected: true },
  { key: 'TIKTOK', label: 'TikTok', supports: ['VIDEOS', 'CAPTIONS', 'HASHTAGS'], defaultSelected: true, selected: true },
  { key: 'YOUTUBE', label: 'YouTube', supports: ['SHORTS', 'VIDEOS'], defaultSelected: false, selected: false },
  { key: 'TWITTER', label: 'X', supports: ['TEXT', 'IMAGES', 'VIDEOS', 'TWEETS'], defaultSelected: true, selected: true },
] as const;

export type PlatformKey = (typeof PLATFORMS)[number]['key'];

export const PLATFORM_LIMITS: Record<string, number> = {
  INSTAGRAM: 2200,
  FACEBOOK: 63206,
  THREADS: 500,
  TWITTER: 280,
  TIKTOK: 2200,
  YOUTUBE: 5000,
};

export const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  THREADS: 'Threads',
  TWITTER: 'X',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
};

export function truncateFor(platform: string, text: string) {
  const limit = PLATFORM_LIMITS[platform] ?? 280;
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}
