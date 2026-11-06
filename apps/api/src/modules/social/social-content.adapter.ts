import { PLATFORM_CAPABILITIES, PlatformCapabilities } from './social.constants';
import { PostContent } from './interfaces/social-provider.interface';

export interface AdaptedContent {
  text: string;
  caption: string;
  hashtags: string[];
  cta?: string;
  link?: string;
}

function countWordsWithoutSpaces(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

export function adaptContent(
  platform: string,
  content: PostContent,
): AdaptedContent {
  const caps: PlatformCapabilities =
    (PLATFORM_CAPABILITIES as any)[platform] ?? PLATFORM_CAPABILITIES.TWITTER;

  const caption = content.caption ?? content.text ?? content.title ?? '';
  const hashtags = (content.hashtags ?? []).filter(Boolean);
  const link = content.link;
  const cta = content.cta;

  let text = caption;
  const hashtagText = hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ');
  if (hashtagText) text = text ? `${text} ${hashtagText}` : hashtagText;

  if (link) {
    text = text ? `${text}\n${link}` : link;
  }

  // Limites de caracteres por rede
  let finalText = text;
  if (finalText.length > caps.maxCaptionLength) {
    finalText = finalText.slice(0, Math.max(caps.maxCaptionLength - 3, 0)) + '...';
  }

  // Limites de palavras (X/Twitter)
  if ((PLATFORM_CAPABILITIES as any)[platform]?.maxCaptionLength === 280) {
    const words = finalText.split(/\s+/).filter(Boolean);
    if (words.length > 280 / 4) {
      const kept: string[] = [];
      let len = 0;
      for (const w of words) {
        const nextLen = len + w.length + 1;
        if (nextLen > 270 && kept.length > 0) break;
        kept.push(w);
        len = nextLen;
      }
      finalText = kept.join(' ');
    }
  }

  const finalHashtags = hashtags.slice(0, Math.max(1, Math.floor(caps.maxCaptionLength / 25)));

  return {
    text: finalText,
    caption: finalText,
    hashtags: finalHashtags,
    cta,
    link,
  };
}

export function validateMediaForPlatform(
  platform: string,
  media: { kind: string; mimeType: string; durationSec?: number; width?: number; height?: number }[],
): { ok: boolean; errors: string[] } {
  const caps = (PLATFORM_CAPABILITIES as any)[platform] ?? PLATFORM_CAPABILITIES.TWITTER;
  const errors: string[] = [];
  for (const m of media) {
    const fmt = (m.mimeType || '').toUpperCase().split(';')[0];
    const base = fmt.replace(/^\w+\//, '');
    if (caps.supportsVideo) {
      if (m.kind === 'VIDEO') {
        if (!caps.supportedVideoFormats.some((f: string) => f === base)) {
          errors.push(`Formato de vídeo não suportado no ${platform}: ${base}`);
        }
        if (m.durationSec && m.durationSec > caps.maxVideoDurationSec) {
          errors.push(`Vídeo excede duração máxima de ${caps.maxVideoDurationSec}s no ${platform}`);
        }
      } else if (!caps.supportedImageFormats.some((f: string) => f === base)) {
        errors.push(`Formato de imagem não suportado no ${platform}: ${base}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
