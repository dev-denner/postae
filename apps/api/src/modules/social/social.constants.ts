import { SocialProviderKey } from '../../common/constants/app.constants';

export interface PlatformCapabilities {
  supportsFeed?: boolean;
  supportsCarousel?: boolean;
  supportsVideo?: boolean;
  supportsReels?: boolean;
  supportsStories?: boolean;
  supportsShorts?: boolean;
  supportsTweets?: boolean;
  supportsLive?: boolean;
  maxCaptionLength: number;
  maxVideoDurationSec: number;
  supportedVideoFormats: string[];
  supportedImageFormats: string[];
  requiredAspectRatio?: string;
  requiresTextOverlay?: boolean;
}

export const PLATFORM_CAPABILITIES: Record<
  SocialProviderKey,
  PlatformCapabilities
> = {
  INSTAGRAM: {
    supportsFeed: true,
    supportsCarousel: true,
    supportsVideo: true,
    supportsReels: true,
    supportsStories: true,
    maxCaptionLength: 2200,
    maxVideoDurationSec: 90,
    supportedVideoFormats: ['MP4', 'MOV', 'WEBM'],
    supportedImageFormats: ['JPG', 'PNG', 'WEBP', 'GIF'],
    requiredAspectRatio: '4:5',
  },
  FACEBOOK: {
    supportsFeed: true,
    supportsCarousel: true,
    supportsVideo: true,
    supportsReels: true,
    maxCaptionLength: 63206,
    maxVideoDurationSec: 240,
    supportedVideoFormats: ['MP4', 'MOV', 'WEBM'],
    supportedImageFormats: ['JPG', 'PNG', 'WEBP', 'GIF'],
  },
  THREADS: {
    supportsFeed: true,
    supportsVideo: true,
    maxCaptionLength: 500,
    maxVideoDurationSec: 120,
    supportedVideoFormats: ['MP4', 'MOV', 'WEBM'],
    supportedImageFormats: ['JPG', 'PNG', 'WEBP'],
  },
  TWITTER: {
    supportsFeed: true,
    supportsVideo: true,
    maxCaptionLength: 280,
    maxVideoDurationSec: 180,
    supportedVideoFormats: ['MP4', 'WEBM'],
    supportedImageFormats: ['JPG', 'PNG', 'WEBP'],
  },
  TIKTOK: {
    supportsVideo: true,
    maxCaptionLength: 2200,
    maxVideoDurationSec: 180,
    supportedVideoFormats: ['MP4', 'MOV', 'WEBM', 'AVI'],
    supportedImageFormats: ['JPG', 'PNG', 'WEBP'],
  },
  YOUTUBE: {
    supportsVideo: true,
    supportsShorts: true,
    maxCaptionLength: 5000,
    maxVideoDurationSec: 3600,
    supportedVideoFormats: ['MP4', 'MOV', 'WEBM'],
    supportedImageFormats: ['JPG', 'PNG', 'WEBP'],
  },
};

export const SUPPORTED_PLATFORMS: SocialProviderKey[] = [
  'INSTAGRAM',
  'FACEBOOK',
  'THREADS',
  'TWITTER',
  'TIKTOK',
  'YOUTUBE',
];
