import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  promises as fs,
} from 'fs';
import { dirname, extname, join, resolve } from 'path';
import {
  hasValidSignature,
  isSafeStorageKey,
  maxImageBytes,
  maxUploadBytes,
  maxVideoBytes,
  signMediaAccess,
  validateUploadMetadata,
  verifyMediaAccess,
} from './media-storage.util';

export interface StoredUpload {
  storageKey: string;
  originalName: string;
  mimeType: string;
  kind: 'IMAGE' | 'VIDEO';
  sizeBytes: number;
  checksum: string;
}

export interface PublicMediaFile {
  path: string;
  mimeType: string;
  sizeBytes: number;
  originalName?: string;
}

export interface MediaLike {
  id: string;
  url: string;
  mimeType: string;
  storageDriver?: string | null;
  storageKey?: string | null;
}

/**
 * Storage local persistente (padrão em desenvolvimento e no Docker Compose).
 *
 * A interface é intencionalmente pequena para permitir substituição por um
 * driver S3 compatível em produção: salvar, ler/remover e gerar URL pública.
 * Nenhum token ou caminho interno é exposto ao frontend; o acesso a arquivos
 * locais usa URL assinada com expiração.
 */
@Injectable()
export class MediaStorageService {
  get uploadDir(): string {
    return resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));
  }

  get temporaryDir(): string {
    return join(this.uploadDir, '.tmp');
  }

  get maxUploadBytes(): number {
    return maxUploadBytes();
  }

  maxImageBytes(): number {
    return maxImageBytes();
  }

  maxVideoBytes(): number {
    return maxVideoBytes();
  }

  ensureDirectories(): void {
    mkdirSync(this.uploadDir, { recursive: true });
    mkdirSync(this.temporaryDir, { recursive: true });
  }

  private publicBaseUrl(): string {
    return (process.env.MEDIA_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  }

  private previewTtlSeconds(): number {
    const value = Number(process.env.MEDIA_PREVIEW_TTL_SECONDS);
    return Number.isFinite(value) && value > 0 ? value : 24 * 60 * 60;
  }

  private publishTtlSeconds(): number {
    const value = Number(process.env.MEDIA_PUBLISH_TTL_SECONDS);
    return Number.isFinite(value) && value > 0 ? value : 60 * 60;
  }

  /**
   * Valida e persiste um arquivo enviado via multipart.
   * O arquivo chega em `.tmp` (multer) e só é movido após passar por todas
   * as validações.
   */
  async saveUpload(file: Express.Multer.File, workspaceId: string): Promise<StoredUpload> {
    if (!file?.path || !existsSync(file.path)) {
      throw new BadRequestException('Arquivo de upload não recebido.');
    }

    try {
      const validated = validateUploadMetadata({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });

      const header = await this.readHeader(file.path);
      if (!hasValidSignature(validated.mimeType, header)) {
        throw new BadRequestException(
          'O conteúdo do arquivo não corresponde ao formato informado. Envie um arquivo válido.',
        );
      }

      const checksum = await this.hashFile(file.path);
      const safeWorkspace = (workspaceId || 'workspace').replace(/[^a-zA-Z0-9_-]/g, '');
      const folder = new Date().toISOString().slice(0, 7);
      const key = `${safeWorkspace}/${folder}/${Date.now()}-${randomBytes(12).toString('hex')}${validated.extension}`;

      await this.writeFile(key, file.path);
      await this.safeUnlink(file.path);

      return {
        storageKey: key,
        originalName: file.originalname || `arquivo${validated.extension}`,
        mimeType: validated.mimeType,
        kind: validated.kind,
        sizeBytes: file.size,
        checksum,
      };
    } catch (error) {
      await this.safeUnlink(file.path);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Não foi possível processar o arquivo enviado.',
      );
    }
  }

  localPath(storageKey: string): string {
    if (!isSafeStorageKey(storageKey)) {
      throw new BadRequestException('Caminho de mídia inválido.');
    }
    const path = resolve(this.uploadDir, storageKey);
    if (!path.startsWith(this.uploadDir + '/')) {
      throw new BadRequestException('Caminho de mídia inválido.');
    }
    return path;
  }

  async readLocal(storageKey: string): Promise<Buffer> {
    const path = this.localPath(storageKey);
    if (!existsSync(path)) throw new NotFoundException('Arquivo de mídia não encontrado.');
    return fs.readFile(path);
  }

  createReadStream(storageKey: string) {
    const path = this.localPath(storageKey);
    if (!existsSync(path)) throw new NotFoundException('Arquivo de mídia não encontrado.');
    return createReadStream(path);
  }

  async removeLocal(storageKey: string | null | undefined): Promise<void> {
    if (!storageKey) return;
    try {
      await this.safeUnlink(this.localPath(storageKey));
    } catch {
      // A remoção do arquivo não deve impedir a limpeza do registro.
    }
  }

  /**
   * URL assinada para exibição no frontend. Pode ser relativa quando
   * MEDIA_PUBLIC_BASE_URL não está configurada (bom para dev local).
   */
  signedUrl(mediaId: string, ttlSeconds = this.previewTtlSeconds()): string {
    const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, Math.floor(ttlSeconds));
    const signature = signMediaAccess(mediaId, expiresAt);
    const base = this.publicBaseUrl();
    return `${base}/api/media/files/${encodeURIComponent(mediaId)}?exp=${expiresAt}&sig=${signature}`;
  }

  /**
   * URL para a plataforma baixar a mídia. Exige base pública absoluta.
   */
  platformUrl(media: MediaLike): string {
    if (media.storageDriver !== 'LOCAL') {
      if (!/^https?:\/\//i.test(media.url || '')) {
        throw new BadRequestException('A mídia externa precisa de uma URL pública http/https.');
      }
      return media.url;
    }

    const base = this.publicBaseUrl();
    if (!base || !/^https?:\/\//i.test(base)) {
      throw new BadRequestException(
        'Esta rede exige uma URL pública para buscar a mídia. Configure MEDIA_PUBLIC_BASE_URL com um endereço acessível pela internet (ou use uma mídia externa).',
      );
    }
    return this.signedUrl(media.id, this.publishTtlSeconds());
  }

  resolvePublicFile(
    media: {
      id: string;
      mimeType: string;
      sizeBytes: number;
      originalName?: string | null;
      storageDriver?: string | null;
      storageKey?: string | null;
    },
    expiresAt: number,
    signature: string,
  ): PublicMediaFile {
    if (media.storageDriver !== 'LOCAL' || !media.storageKey) {
      throw new NotFoundException('Arquivo local não encontrado.');
    }
    if (!verifyMediaAccess(media.id, expiresAt, signature)) {
      throw new BadRequestException('Link de mídia inválido ou expirado.');
    }
    const path = this.localPath(media.storageKey);
    if (!existsSync(path)) throw new NotFoundException('Arquivo de mídia não encontrado.');
    return {
      path,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      originalName: media.originalName || undefined,
    };
  }

  private async writeFile(storageKey: string, sourcePath: string): Promise<void> {
    const destination = this.localPath(storageKey);
    mkdirSync(dirname(destination), { recursive: true });
    try {
      await fs.rename(sourcePath, destination);
    } catch (error: any) {
      if (error?.code !== 'EXDEV') throw error;
      await fs.copyFile(sourcePath, destination);
      await this.safeUnlink(sourcePath);
    }
  }

  private async readHeader(path: string): Promise<Buffer> {
    const handle = await fs.open(path, 'r');
    try {
      const buffer = Buffer.alloc(32);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  private async hashFile(path: string): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolvePromise(hash.digest('hex')));
    });
  }

  private async safeUnlink(path: string): Promise<void> {
    try {
      await fs.unlink(path);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        // Não propaga falha de limpeza como erro de upload.
        console.warn(`[MediaStorage] Falha ao remover arquivo temporário: ${error?.code || 'erro'}`);
      }
    }
  }
}

/** Nome de arquivo seguro para Content-Disposition. */
export function safeDownloadName(name: string | undefined, fallback = 'midia'): string {
  const base = (name || fallback).split(/[\\/]/).pop() || fallback;
  return base.replace(/[\r\n"]/g, '_').slice(0, 200);
}

/** Extensão usada para nomear o arquivo final. */
export function extensionForUpload(originalName: string): string {
  return extname(originalName || '').toLowerCase();
}
