import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaKind, MediaStatus } from '../../common/constants/app.constants';
import { assertSafePublicUrl } from '../../common/utils/url-safety.util';
import { CreateExternalMediaDto } from './dto/create-external-media.dto';
import { MediaStorageService, PublicMediaFile } from './media-storage.service';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  mimeType: string;
  url: string;
  storageDriver: 'EXTERNAL' | 'LOCAL';
  originalUrl?: string;
  originalName?: string;
  checksum?: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  folder?: string;
  tags: string[];
  publicId?: string;
  createdAt?: Date;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
  ) {
    this.storage.ensureDirectories();
  }

  async list(
    workspaceId: string,
    query: {
      kind?: string;
      search?: string;
      folder?: string;
      page?: number | string;
      limit?: number | string;
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: any = { workspaceId };
    if (query.kind) where.kind = query.kind;
    if (query.folder) where.folder = query.folder;
    if (query.search) {
      where.OR = [
        { url: { contains: query.search, mode: 'insensitive' } },
        { originalName: { contains: query.search, mode: 'insensitive' } },
        { mimeType: { contains: query.search, mode: 'insensitive' } },
        { tags: { has: query.search } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.media.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.media.count({ where }),
    ]);
    return {
      items: items.map((m) => this.toItem(m)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, workspaceId: string) {
    const media = await this.prisma.media.findFirst({ where: { id, workspaceId } });
    if (!media) throw new NotFoundException('Mídia não encontrada.');
    return this.toItem(media);
  }

  async create(input: {
    workspaceId: string;
    userId: string;
    kind: MediaKind;
    status?: MediaStatus;
    mimeType: string;
    url: string;
    originalUrl?: string;
    storageDriver?: 'EXTERNAL' | 'LOCAL';
    storageKey?: string;
    originalName?: string;
    checksum?: string;
    width?: number;
    height?: number;
    durationSec?: number;
    sizeBytes: number;
    folder?: string;
    tags?: string[];
  }) {
    const media = await this.prisma.media.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        kind: input.kind,
        status: input.status ?? 'READY',
        mimeType: input.mimeType,
        url: input.url,
        originalUrl: input.originalUrl,
        storageDriver: input.storageDriver ?? 'EXTERNAL',
        storageKey: input.storageKey,
        originalName: input.originalName,
        checksum: input.checksum,
        width: input.width,
        height: input.height,
        durationSec: input.durationSec,
        sizeBytes: input.sizeBytes,
        folder: input.folder,
        tags: input.tags ?? [],
      },
    });
    return this.toItem(media);
  }

  /**
   * Salva um arquivo local no storage persistente e registra os metadados.
   * Usa URL assinada para exibição e publicação, sem expor caminhos internos.
   */
  async createUpload(
    workspaceId: string,
    userId: string,
    file: Express.Multer.File,
    options: { folder?: string; tags?: string[] } = {},
  ) {
    const stored = await this.storage.saveUpload(file, workspaceId);
    let createdId: string | undefined;
    try {
      const media = await this.prisma.media.create({
        data: {
          workspaceId,
          userId,
          kind: stored.kind,
          status: 'READY',
          mimeType: stored.mimeType,
          // A URL canônica é preenchida logo abaixo, após conhecermos o id.
          url: '',
          storageDriver: 'LOCAL',
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          checksum: stored.checksum,
          sizeBytes: stored.sizeBytes,
          folder: options.folder || 'Uploads',
          tags: options.tags ?? [],
        },
      });
      createdId = media.id;
      const updated = await this.prisma.media.update({
        where: { id: media.id },
        data: { url: `/api/media/files/${media.id}` },
      });
      return this.toItem(updated);
    } catch (error) {
      if (createdId) {
        await this.prisma.media.delete({ where: { id: createdId } }).catch(() => undefined);
      }
      await this.storage.removeLocal(stored.storageKey);
      throw error;
    }
  }

  /**
   * Cadastra uma mídia já hospedada em URL pública. Não faz upload nem copia
   * o arquivo; as plataformas precisam conseguir acessar essa URL.
   */
  async createExternal(workspaceId: string, userId: string, dto: CreateExternalMediaDto) {
    try {
      await assertSafePublicUrl(dto.url);
    } catch (error: any) {
      throw new BadRequestException(String(error?.message || 'URL de mídia inválida.'));
    }
    const mimeType =
      dto.mimeType || (dto.kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg');
    return this.create({
      workspaceId,
      userId,
      kind: dto.kind as MediaKind,
      status: 'READY',
      mimeType,
      url: dto.url,
      originalUrl: dto.url,
      storageDriver: 'EXTERNAL',
      width: dto.width,
      height: dto.height,
      durationSec: dto.durationSec,
      sizeBytes: dto.sizeBytes ?? 0,
      folder: dto.folder ?? 'Externas',
      tags: dto.tags ?? [],
    });
  }

  async remove(id: string, workspaceId: string) {
    const media = await this.prisma.media.findFirst({ where: { id, workspaceId } });
    if (!media) throw new NotFoundException('Mídia não encontrada.');
    const usage = await this.prisma.postMedia.count({ where: { mediaId: id } });
    if (usage > 0) {
      throw new ConflictException(
        'Esta mídia está vinculada a uma publicação. Remova-a do post antes de excluir.',
      );
    }
    await this.prisma.media.delete({ where: { id } });
    if (media.storageDriver === 'LOCAL' && media.storageKey) {
      await this.storage.removeLocal(media.storageKey);
    }
    return { deleted: true };
  }

  /** Resolve um arquivo local a partir de uma URL assinada e temporária. */
  async getPublicFile(id: string, expiresAt: number, signature: string): Promise<PublicMediaFile> {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Mídia não encontrada.');
    return this.storage.resolvePublicFile(media, expiresAt, signature);
  }

  private toItem(m: any): MediaItem {
    const storageDriver = (m.storageDriver || 'EXTERNAL') as 'EXTERNAL' | 'LOCAL';
    const url =
      storageDriver === 'LOCAL' ? this.storage.signedUrl(m.id) : m.url;
    return {
      id: m.id,
      kind: m.kind,
      status: m.status,
      mimeType: m.mimeType,
      url,
      storageDriver,
      originalUrl: m.originalUrl ?? undefined,
      originalName: m.originalName ?? undefined,
      checksum: m.checksum ?? undefined,
      width: m.width ?? undefined,
      height: m.height ?? undefined,
      sizeBytes: m.sizeBytes,
      folder: m.folder ?? undefined,
      tags: m.tags ?? [],
      publicId: m.publicId ?? undefined,
      createdAt: m.createdAt,
    };
  }
}
