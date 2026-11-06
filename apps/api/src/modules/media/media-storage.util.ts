import { createHmac, timingSafeEqual } from 'crypto';
import { extname } from 'path';

export type UploadKind = 'IMAGE' | 'VIDEO';

export interface UploadMetadata {
  originalname: string;
  mimetype: string;
  size: number;
}

export interface ValidatedUpload {
  kind: UploadKind;
  mimeType: string;
  extension: string;
}

interface MimeRule {
  kind: UploadKind;
  extensions: string[];
  magic?: (header: Buffer) => boolean;
}

/**
 * Lista de tipos aceitos. A validação combina MIME declarado, extensão e
 * assinatura binária (magic bytes) para reduzir arquivos disfarçados.
 */
export const ALLOWED_MEDIA_TYPES: Record<string, MimeRule> = {
  'image/jpeg': {
    kind: 'IMAGE',
    extensions: ['.jpg', '.jpeg'],
    magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    kind: 'IMAGE',
    extensions: ['.png'],
    magic: (b) =>
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    kind: 'IMAGE',
    extensions: ['.webp'],
    magic: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'image/gif': {
    kind: 'IMAGE',
    extensions: ['.gif'],
    magic: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')),
  },
  'video/mp4': {
    kind: 'VIDEO',
    extensions: ['.mp4', '.m4v'],
    magic: (b) => b.length >= 8 && b.subarray(4, 8).toString('ascii') === 'ftyp',
  },
  'video/quicktime': {
    kind: 'VIDEO',
    extensions: ['.mov'],
    magic: (b) =>
      b.length >= 8 &&
      ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(b.subarray(4, 8).toString('ascii')),
  },
  'video/webm': {
    kind: 'VIDEO',
    extensions: ['.webm'],
    magic: (b) =>
      b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
};

const MAX_IMAGE_MB_DEFAULT = 25;
const MAX_VIDEO_MB_DEFAULT = 200;

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function maxImageBytes(): number {
  return envNumber('MAX_IMAGE_UPLOAD_MB', MAX_IMAGE_MB_DEFAULT) * 1024 * 1024;
}

export function maxVideoBytes(): number {
  return envNumber('MAX_VIDEO_UPLOAD_MB', MAX_VIDEO_MB_DEFAULT) * 1024 * 1024;
}

export function maxUploadBytes(): number {
  return Math.max(maxImageBytes(), maxVideoBytes());
}

/**
 * Valida metadados do arquivo. A assinatura binária é conferida depois,
 * quando o arquivo já está no disco temporário.
 */
export function validateUploadMetadata(file: UploadMetadata): ValidatedUpload {
  const mimeType = (file.mimetype || '').toLowerCase();
  const rule = ALLOWED_MEDIA_TYPES[mimeType];
  if (!rule) {
    throw new Error(
      'Formato não suportado. Envie imagem JPEG/PNG/WebP/GIF ou vídeo MP4/MOV/WebM.',
    );
  }

  const extension = extname(file.originalname || '').toLowerCase();
  if (!rule.extensions.includes(extension)) {
    throw new Error(
      `A extensão "${extension || '(sem extensão)'}" não corresponde ao tipo ${mimeType}.`,
    );
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('O arquivo enviado está vazio.');
  }

  const limit = rule.kind === 'IMAGE' ? maxImageBytes() : maxVideoBytes();
  if (file.size > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    throw new Error(
      `Arquivo muito grande para ${rule.kind === 'IMAGE' ? 'imagem' : 'vídeo'}. Limite: ${mb} MB.`,
    );
  }

  return { kind: rule.kind, mimeType, extension };
}

export function hasValidSignature(mimeType: string, header: Buffer): boolean {
  const rule = ALLOWED_MEDIA_TYPES[mimeType];
  if (!rule?.magic) return true;
  return rule.magic(header);
}

export function signingSecret(): string {
  return (
    process.env.MEDIA_SIGNING_SECRET ||
    process.env.ENCRYPTION_KEY ||
    'postae-dev-media-signing-key'
  );
}

export function signMediaAccess(mediaId: string, expiresAt: number): string {
  return createHmac('sha256', signingSecret())
    .update(`${mediaId}.${expiresAt}`)
    .digest('base64url');
}

export function verifyMediaAccess(
  mediaId: string,
  expiresAt: number,
  signature: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < nowSeconds) return false;
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const expected = Buffer.from(signMediaAccess(mediaId, expiresAt));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/** Evita path traversal ao montar caminhos a partir de chaves do banco. */
export function isSafeStorageKey(key: string): boolean {
  if (!key || key.startsWith('/') || key.startsWith('\\')) return false;
  if (key.includes('\0')) return false;
  return !key.split(/[\\/]/).some((part) => part === '..');
}
