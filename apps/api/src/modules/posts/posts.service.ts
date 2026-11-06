import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { POST_STATUS, PostStatus } from '../../common/constants/app.constants';
import { CreatePostDto, UpdatePostDto } from './dto/create-post.dto';
import { SchedulerService } from '../scheduler/scheduler.service';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const PUBLIC_ACCOUNT_SELECT = {
  id: true,
  provider: true,
  providerAccountId: true,
  displayName: true,
  username: true,
  avatarUrl: true,
  status: true,
  tokenExpiresAt: true,
  refreshTokenExpiresAt: true,
  lastError: true,
} as const;

const POST_INCLUDE: any = {
  media: {
    include: { media: true },
    orderBy: { sortIndex: 'asc' },
  },
  destinations: {
    orderBy: { createdAt: 'asc' },
    include: {
      socialAccount: { select: PUBLIC_ACCOUNT_SELECT },
    },
  },
  logs: {
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      destinationId: true,
      provider: true,
      status: true,
      externalPostId: true,
      error: true,
      createdAt: true,
    },
  },
};

const EDITABLE_STATUSES: PostStatus[] = [POST_STATUS.DRAFT, POST_STATUS.SCHEDULED];

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  async create(workspaceId: string, dto: CreatePostDto) {
    const status = (dto.status as PostStatus) ?? (dto.publishAt ? POST_STATUS.SCHEDULED : POST_STATUS.DRAFT);
    if (!EDITABLE_STATUSES.includes(status)) {
      throw new BadRequestException('Um post novo só pode ser criado como DRAFT ou SCHEDULED.');
    }
    if (status === POST_STATUS.SCHEDULED && !dto.publishAt) {
      throw new BadRequestException('Informe a data de agendamento para criar um post SCHEDULED.');
    }

    const accounts = await this.resolveAccounts(workspaceId, dto.socialAccountIds ?? []);
    if (status === POST_STATUS.SCHEDULED && !accounts.length) {
      throw new BadRequestException('Selecione pelo menos uma conta conectada para agendar a publicação.');
    }
    const media = await this.validateMedia(workspaceId, dto.mediaIds ?? []);

    const post = await this.prisma.post.create({
      data: {
        workspaceId,
        status,
        publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
        content: this.buildContent(dto) as any,
        socialAccountId: accounts[0]?.id ?? null,
        mediaIds: media.map((item) => item.id),
        media: media.length
          ? {
              create: media.map((item, index) => ({
                mediaId: item.id,
                role: index === 0 ? 'PRIMARY' : 'MEDIA',
                sortIndex: index,
              })),
            }
          : undefined,
        destinations: accounts.length
          ? {
              create: accounts.map((account) => ({
                socialAccountId: account.id,
                provider: account.provider,
                accountDisplayName: account.displayName || account.username || 'Conta social',
                accountUsername: account.username,
                status: 'PENDING',
              })),
            }
          : undefined,
      },
      include: POST_INCLUDE,
    });

    if (status === POST_STATUS.SCHEDULED && dto.publishAt) {
      try {
        await this.enqueueSchedule(post.id, workspaceId, new Date(dto.publishAt));
      } catch (error) {
        await this.prisma.post.update({
          where: { id: post.id },
          data: { status: POST_STATUS.DRAFT },
        });
        throw error;
      }
    }

    return this.findOne(post.id, workspaceId);
  }

  async findAll(
    workspaceId: string,
    query: {
      page?: number | string;
      limit?: number | string;
      status?: string;
      platform?: string;
      socialAccountId?: string;
    },
  ): Promise<Paginated<any>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: any = { workspaceId };
    if (query.status) where.status = query.status;
    if (query.socialAccountId) {
      where.OR = [
        { destinations: { some: { socialAccountId: query.socialAccountId } } },
        { socialAccountId: query.socialAccountId },
      ];
    }
    if (query.platform) {
      const platformFilter = [
        { destinations: { some: { provider: query.platform } } },
        { socialAccount: { provider: query.platform } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: platformFilter }];
        delete where.OR;
      } else {
        where.OR = platformFilter;
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        orderBy: [{ publishAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: POST_INCLUDE,
      }),
      this.prisma.post.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string, workspaceId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId },
      include: POST_INCLUDE,
    });
    if (!post) throw new NotFoundException('Post não encontrado');
    return post;
  }

  async update(id: string, workspaceId: string, dto: UpdatePostDto) {
    const existing = await this.findOne(id, workspaceId);
    if (existing.status === POST_STATUS.PROCESSING) {
      throw new ConflictException('Aguarde o processamento atual terminar antes de editar este post.');
    }
    if (existing.status === POST_STATUS.PUBLISHED || existing.status === POST_STATUS.PARTIAL) {
      throw new ConflictException(
        'Posts já publicados não podem ser editados. Duplique a publicação para criar uma nova versão.',
      );
    }

    const hasContentChange = this.hasContentFields(dto);
    const existingContent = (existing.content ?? {}) as Record<string, unknown>;
    const content = hasContentChange
      ? { ...existingContent, ...this.buildContent(dto) }
      : undefined;

    let targetStatus = (dto.status as PostStatus) ?? (existing.status as PostStatus);
    if (!EDITABLE_STATUSES.includes(targetStatus) && dto.status) {
      throw new BadRequestException('Use os endpoints de publicar, cancelar ou reprocessar para mudar este status.');
    }
    if (
      dto.publishAt &&
      !dto.status &&
      (targetStatus === POST_STATUS.DRAFT ||
        targetStatus === POST_STATUS.FAILED ||
        targetStatus === POST_STATUS.CANCELLED)
    ) {
      targetStatus = POST_STATUS.SCHEDULED;
    }

    const accounts =
      dto.socialAccountIds !== undefined
        ? await this.resolveAccounts(workspaceId, dto.socialAccountIds)
        : undefined;
    if (dto.socialAccountIds !== undefined) {
      this.assertDestinationsEditable(existing.status);
      if (targetStatus === POST_STATUS.SCHEDULED && !accounts?.length) {
        throw new BadRequestException('Selecione pelo menos uma conta para manter o post agendado.');
      }
    } else if (targetStatus === POST_STATUS.SCHEDULED) {
      const accountCount = existing.destinations?.length ?? (existing.socialAccountId ? 1 : 0);
      if (!accountCount) {
        throw new BadRequestException('Selecione pelo menos uma conta para agendar a publicação.');
      }
    }

    if (targetStatus === POST_STATUS.SCHEDULED && !(dto.publishAt ?? existing.publishAt)) {
      throw new BadRequestException('Informe a data de agendamento para manter o post como SCHEDULED.');
    }

    const media = dto.mediaIds !== undefined
      ? await this.validateMedia(workspaceId, dto.mediaIds)
      : undefined;

    const scheduleChanged =
      Boolean(dto.publishAt) ||
      (dto.status !== undefined && dto.status !== existing.status) ||
      Boolean(accounts);

    await this.prisma.$transaction(async (tx) => {
      if (accounts !== undefined) {
        const selected = new Set(accounts.map((account) => account.id));
        const removable = existing.destinations
          .filter((destination: any) => destination.status !== 'PUBLISHED')
          .filter((destination: any) => !destination.socialAccountId || !selected.has(destination.socialAccountId))
          .map((destination: any) => destination.id);
        if (removable.length) {
          await tx.postDestination.deleteMany({ where: { id: { in: removable } } });
        }

        const existingAccountIds = new Set(
          existing.destinations
            .map((destination: any) => destination.socialAccountId)
            .filter(Boolean),
        );
        for (const account of accounts) {
          if (existingAccountIds.has(account.id)) continue;
          await tx.postDestination.create({
            data: {
              postId: id,
              socialAccountId: account.id,
              provider: account.provider,
              accountDisplayName: account.displayName || account.username || 'Conta social',
              accountUsername: account.username,
              status: 'PENDING',
            },
          });
        }
      }

      if (targetStatus === POST_STATUS.SCHEDULED && existing.status !== POST_STATUS.SCHEDULED) {
        // Ao reagendar um post que falhou ou foi cancelado, os destinos
        // precisam voltar para a fila; os já publicados nunca são reenviados.
        await tx.postDestination.updateMany({
          where: { postId: id, status: { in: ['FAILED', 'SKIPPED'] } },
          data: { status: 'PENDING', error: null, warning: null, lastAttemptAt: null },
        });
      }

      if (media !== undefined) {
        await tx.postMedia.deleteMany({ where: { postId: id } });
        if (media.length) {
          await tx.postMedia.createMany({
            data: media.map((item, index) => ({
              postId: id,
              mediaId: item.id,
              role: index === 0 ? 'PRIMARY' : 'MEDIA',
              sortIndex: index,
            })),
          });
        }
      }

      await tx.post.update({
        where: { id },
        data: {
          status: targetStatus,
          publishAt: dto.publishAt ? new Date(dto.publishAt) : undefined,
          content: content as any,
          mediaIds: media ? media.map((item) => item.id) : undefined,
          socialAccountId:
            accounts !== undefined ? accounts[0]?.id ?? null : undefined,
          failureReason: targetStatus === POST_STATUS.DRAFT ? null : undefined,
        },
      });
    });

    if (scheduleChanged) {
      await this.cancelPendingSchedules(id);
      if (targetStatus === POST_STATUS.SCHEDULED) {
        const runAt = dto.publishAt ? new Date(dto.publishAt) : existing.publishAt;
        if (!runAt) {
          throw new BadRequestException('Informe a data de agendamento.');
        }
        await this.enqueueSchedule(id, workspaceId, runAt);
      }
    }

    return this.findOne(id, workspaceId);
  }

  async remove(id: string, workspaceId: string) {
    const post = await this.findOne(id, workspaceId);
    if (post.status === POST_STATUS.PROCESSING) {
      throw new ConflictException('Não é possível excluir um post em processamento.');
    }
    await this.cancelPendingSchedules(id);
    await this.prisma.post.delete({ where: { id } });
    return { deleted: true };
  }

  async duplicate(id: string, workspaceId: string) {
    const source = await this.findOne(id, workspaceId);
    const media = await this.prisma.postMedia.findMany({ where: { postId: id } });
    const destinations = await this.prisma.postDestination.findMany({
      where: { postId: id },
      orderBy: { createdAt: 'asc' },
    });

    const copy = await this.prisma.post.create({
      data: {
        workspaceId,
        status: 'DRAFT',
        publishAt: null,
        content: source.content as any,
        socialAccountId: source.socialAccountId,
        mediaIds: source.mediaIds ?? [],
        media: media.length
          ? {
              create: media.map((entry) => ({
                mediaId: entry.mediaId,
                role: entry.role,
                sortIndex: entry.sortIndex,
              })),
            }
          : undefined,
        destinations: destinations.length
          ? {
              create: destinations.map((destination) => ({
                socialAccountId: destination.socialAccountId,
                provider: destination.provider,
                accountDisplayName: destination.accountDisplayName,
                accountUsername: destination.accountUsername,
                status: 'PENDING',
              })),
            }
          : undefined,
      },
    });
    return this.findOne(copy.id, workspaceId);
  }

  async scheduleNow(id: string, workspaceId: string) {
    const post = await this.findOne(id, workspaceId);
    if (post.status === POST_STATUS.PUBLISHED) {
      throw new ConflictException('Este post já foi publicado em todas as contas.');
    }
    if (post.status === POST_STATUS.PROCESSING) {
      throw new ConflictException('Este post já está sendo processado.');
    }
    await this.assertHasDestinations(id, post.socialAccountId);

    const previousStatus = post.status;
    await this.cancelPendingSchedules(id);
    await this.prisma.postDestination.updateMany({
      where: { postId: id, status: { in: ['FAILED', 'SKIPPED'] } },
      data: { status: 'PENDING', error: null, warning: null },
    });
    await this.prisma.post.update({
      where: { id },
      data: {
        status: POST_STATUS.PROCESSING,
        publishAt: new Date(),
        failureReason: null,
      },
    });

    try {
      await this.enqueueSchedule(id, workspaceId, new Date());
    } catch (error) {
      await this.prisma.post.update({
        where: { id },
        data: { status: previousStatus },
      });
      throw error;
    }
    return this.findOne(id, workspaceId);
  }

  async retry(id: string, workspaceId: string) {
    const post = await this.findOne(id, workspaceId);
    if (post.status === POST_STATUS.PROCESSING) {
      throw new ConflictException('Este post já está sendo processado.');
    }
    const failed = await this.prisma.postDestination.count({
      where: { postId: id, status: 'FAILED' },
    });
    if (!failed) {
      throw new BadRequestException('Não há destinos com falha para reprocessar.');
    }

    await this.cancelPendingSchedules(id);
    await this.prisma.postDestination.updateMany({
      where: { postId: id, status: 'FAILED' },
      data: { status: 'PENDING', error: null, lastAttemptAt: null },
    });
    await this.prisma.post.update({
      where: { id },
      data: {
        status: POST_STATUS.PROCESSING,
        publishAt: new Date(),
        failureReason: null,
      },
    });

    try {
      await this.enqueueSchedule(id, workspaceId, new Date());
    } catch (error) {
      await this.prisma.post.update({ where: { id }, data: { status: post.status } });
      throw error;
    }
    return this.findOne(id, workspaceId);
  }

  async cancel(id: string, workspaceId: string) {
    const post = await this.findOne(id, workspaceId);
    if (post.status === POST_STATUS.PUBLISHED || post.status === POST_STATUS.PARTIAL) {
      throw new ConflictException('Não é possível cancelar um post já publicado.');
    }
    if (post.status === POST_STATUS.PROCESSING) {
      throw new ConflictException('Aguarde o processamento terminar antes de cancelar este post.');
    }
    await this.cancelPendingSchedules(id);
    await this.prisma.postDestination.updateMany({
      where: { postId: id, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
      data: { status: 'SKIPPED' },
    });
    await this.prisma.post.update({
      where: { id },
      data: { status: POST_STATUS.CANCELLED },
    });
    return this.findOne(id, workspaceId);
  }

  private async resolveAccounts(workspaceId: string, ids: string[]): Promise<any[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    const accounts = await this.prisma.socialAccount.findMany({
      where: { id: { in: unique }, workspaceId },
    });
    if (accounts.length !== unique.length) {
      throw new BadRequestException('Uma ou mais contas selecionadas não pertencem a este workspace.');
    }
    const unavailable = accounts.filter((account) => account.status !== 'ACTIVE');
    if (unavailable.length) {
      const labels = unavailable
        .map((account) => account.displayName || account.username || account.provider)
        .join(', ');
      throw new BadRequestException(
        `Estas contas precisam ser reconectadas antes de publicar: ${labels}.`,
      );
    }
    const byId = new Map(accounts.map((account) => [account.id, account]));
    return unique.map((id) => byId.get(id)).filter(Boolean);
  }

  private async validateMedia(workspaceId: string, ids: string[]): Promise<any[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    const media = await this.prisma.media.findMany({
      where: { id: { in: unique }, workspaceId },
    });
    if (media.length !== unique.length) {
      throw new BadRequestException('Uma ou mais mídias não pertencem a este workspace.');
    }
    const byId = new Map(media.map((item) => [item.id, item]));
    return unique.map((id) => byId.get(id)).filter(Boolean);
  }

  private buildContent(dto: CreatePostDto | UpdatePostDto): Record<string, unknown> {
    const content: Record<string, unknown> = {};
    const fields = ['title', 'text', 'caption', 'hashtags', 'link', 'cta'] as const;
    for (const field of fields) {
      const value = (dto as any)[field];
      if (value !== undefined) content[field] = value;
    }
    return content;
  }

  private hasContentFields(dto: UpdatePostDto): boolean {
    return ['title', 'text', 'caption', 'hashtags', 'link', 'cta'].some(
      (field) => (dto as any)[field] !== undefined,
    );
  }

  private assertDestinationsEditable(status: string): void {
    if (status === POST_STATUS.PUBLISHED || status === POST_STATUS.PARTIAL) {
      throw new ConflictException('Não é possível alterar as contas de um post já publicado.');
    }
  }

  private async assertHasDestinations(postId: string, legacyAccountId: string | null): Promise<void> {
    const count = await this.prisma.postDestination.count({ where: { postId } });
    if (!count && !legacyAccountId) {
      throw new BadRequestException('Selecione pelo menos uma conta conectada antes de publicar.');
    }
  }

  private async enqueueSchedule(postId: string, workspaceId: string, runAt: Date) {
    const schedule = await this.prisma.schedule.create({
      data: { postId, workspaceId, runAt, status: 'PENDING' },
    });
    try {
      await this.scheduler.enqueuePost({ postId, scheduleId: schedule.id, runAt });
    } catch (error: any) {
      await this.prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          status: 'FAILED',
          lastError: String(error?.message || 'Fila indisponível').slice(0, 1000),
        },
      });
      throw new ServiceUnavailableException(
        'O post foi salvo, mas a fila de publicação está indisponível. Verifique o Redis e tente reagendar.',
      );
    }
    return schedule;
  }

  private async cancelPendingSchedules(postId: string): Promise<void> {
    const schedules = await this.prisma.schedule.findMany({
      where: { postId, status: 'PENDING' },
      select: { id: true },
    });
    if (!schedules.length) return;
    await this.prisma.schedule.updateMany({
      where: { id: { in: schedules.map((schedule) => schedule.id) } },
      data: { status: 'CANCELLED' },
    });
    await Promise.all(schedules.map((schedule) => this.scheduler.cancel(schedule.id)));
  }
}
