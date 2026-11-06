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

export interface MediaItem {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  mimeType: string;
  url: string;
  originalUrl?: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  folder?: string;
  tags: string[];
  publicId?: string;
}

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string, query: { kind?: string; search?: string; folder?: string; page?: number | string; limit?: number | string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: any = { workspaceId };
    if (query.kind) where.kind = query.kind;
    if (query.folder) where.folder = query.folder;
    if (query.search) {
      where.OR = [
        { url: { contains: query.search, mode: 'insensitive' } },
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
      width: dto.width,
      height: dto.height,
      durationSec: dto.durationSec,
      sizeBytes: dto.sizeBytes ?? 0,
      folder: dto.folder ?? 'Externas',
      tags: dto.tags ?? [],
    });
  }

  async remove(id: string, workspaceId: string) {
    await this.findOne(id, workspaceId);
    const usage = await this.prisma.postMedia.count({ where: { mediaId: id } });
    if (usage > 0) {
      throw new ConflictException(
        'Esta mídia está vinculada a uma publicação. Remova-a do post antes de excluir.',
      );
    }
    await this.prisma.media.delete({ where: { id } });
    return { deleted: true };
  }

  private toItem(m: any): MediaItem {
    return {
      id: m.id,
      kind: m.kind,
      status: m.status,
      mimeType: m.mimeType,
      url: m.url,
      originalUrl: m.originalUrl,
      width: m.width,
      height: m.height,
      sizeBytes: m.sizeBytes,
      folder: m.folder,
      tags: m.tags ?? [],
      publicId: m.publicId,
    };
  }
}
