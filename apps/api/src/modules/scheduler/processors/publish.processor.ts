import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SocialService, SocialPublishError } from '../../social/social.service';
import { MediaPayload, PostContent } from '../../social/interfaces/social-provider.interface';
import {
  PUBLISH_QUEUE,
  REDIS_CONNECTION,
  RedisConnectionConfig,
} from '../constants';

interface PublishJobData {
  postId: string;
  scheduleId?: string;
}

@Injectable()
export class PublishProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly socialService: SocialService,
    @Inject(REDIS_CONNECTION) private readonly redisConfig: RedisConnectionConfig,
  ) {}

  async onModuleInit() {
    this.worker = new Worker(PUBLISH_QUEUE, (job) => this.process(job), {
      connection: this.redisConfig.connection,
      concurrency: 2,
    });
    this.worker.on('failed', (job, error) => {
      console.error(
        `[PublishProcessor] job ${job?.id ?? '?'} falhou: ${error?.message ?? 'erro desconhecido'}`,
      );
    });
    this.worker.on('error', (error) => {
      console.error(`[PublishProcessor] erro na conexão com o Redis: ${error.message}`);
    });
  }

  async process(job: Job<PublishJobData>): Promise<void> {
    const { postId, scheduleId } = job.data;
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        media: { include: { media: true } },
        destinations: true,
      },
    });

    if (!post) return;
    if (post.status === 'CANCELLED' || post.status === 'DRAFT') return;

    // Um job antigo não pode publicar antes do novo horário após uma edição.
    if (post.publishAt && post.publishAt.getTime() > Date.now() + 60_000) {
      return;
    }

    try {
      await this.prisma.post.update({
        where: { id: post.id },
        data: { status: 'PROCESSING', failureReason: null },
      });
      if (scheduleId) {
        await this.prisma.schedule.update({
          where: { id: scheduleId },
          data: { status: 'RUNNING', lastError: null },
        }).catch(() => undefined);
      }

      await this.ensureDestinations(post);

      const media = await this.resolveMedia(post);
      const content = (post.content ?? {}) as PostContent;
      const publishAt = post.publishAt ?? new Date();

      const destinations = await this.prisma.postDestination.findMany({
        where: { postId: post.id },
        orderBy: { createdAt: 'asc' },
      });

      for (const destination of destinations) {
        if (destination.status !== 'PENDING') continue;

        await this.prisma.postDestination.update({
          where: { id: destination.id },
          data: {
            status: 'PROCESSING',
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
            error: null,
          },
        });

        if (!destination.socialAccountId) {
          const message = 'A conta social deste destino não está mais disponível.';
          await this.failDestination(destination.id, post.id, post.workspaceId, destination.provider, message);
          continue;
        }

        try {
          const result = await this.socialService.publishToAccount({
            accountId: destination.socialAccountId,
            content,
            media,
            publishAt,
          });

          await this.prisma.postDestination.update({
            where: { id: destination.id },
            data: {
              status: 'PUBLISHED',
              externalPostId: result.externalPostId,
              warning: result.warning ?? null,
              error: null,
              publishedAt: new Date(),
            },
          });
          await this.prisma.publicationLog.create({
            data: {
              postId: post.id,
              destinationId: destination.id,
              workspaceId: post.workspaceId,
              provider: destination.provider,
              status: 'PUBLISHED',
              externalPostId: result.externalPostId ?? null,
            },
          });
        } catch (error: any) {
          const message =
            error instanceof SocialPublishError
              ? error.message
              : String(error?.message || 'Falha ao publicar nesta conta');
          await this.failDestination(
            destination.id,
            post.id,
            post.workspaceId,
            destination.provider,
            message,
          );
        }
      }

      await this.aggregatePostStatus(post.id);
      if (scheduleId) {
        const status = await this.currentPostStatus(post.id);
        await this.prisma.schedule.update({
          where: { id: scheduleId },
          data: {
            status: status === 'FAILED' ? 'FAILED' : 'COMPLETED',
            executedAt: new Date(),
          },
        }).catch(() => undefined);
      }
    } catch (error: any) {
      const message = String(error?.message || 'Erro inesperado ao publicar').slice(0, 1000);
      // Destinos que ficaram no meio do caminho precisam virar FAILED para que
      // o endpoint de reprocessamento consiga encontrá-los.
      await this.prisma.postDestination.updateMany({
        where: { postId: post.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', error: message },
      }).catch(() => undefined);
      await this.prisma.post.update({
        where: { id: post.id },
        data: { status: 'FAILED', failureReason: message },
      }).catch(() => undefined);
      if (scheduleId) {
        await this.prisma.schedule.update({
          where: { id: scheduleId },
          data: { status: 'FAILED', lastError: message, executedAt: new Date() },
        }).catch(() => undefined);
      }
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async ensureDestinations(post: any): Promise<void> {
    if (post.destinations.length > 0 || !post.socialAccountId) return;

    const account = await this.prisma.socialAccount.findUnique({
      where: { id: post.socialAccountId },
    });
    if (!account) return;

    await this.prisma.postDestination.create({
      data: {
        postId: post.id,
        socialAccountId: account.id,
        provider: account.provider,
        accountDisplayName: account.displayName || account.username || 'Conta social',
        accountUsername: account.username,
        status: 'PENDING',
      },
    });
  }

  private async resolveMedia(post: any): Promise<MediaPayload[]> {
    let records = (post.media ?? []).map((entry: any) => entry.media);
    if (!records.length && Array.isArray(post.mediaIds) && post.mediaIds.length) {
      records = await this.prisma.media.findMany({
        where: { id: { in: post.mediaIds }, workspaceId: post.workspaceId },
      });
    }
    return records.map((media: any) => ({
      id: media.id,
      kind: media.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
      url: media.url,
      mimeType: media.mimeType,
      width: media.width ?? undefined,
      height: media.height ?? undefined,
    }));
  }

  private async failDestination(
    destinationId: string,
    postId: string,
    workspaceId: string,
    provider: string,
    message: string,
  ): Promise<void> {
    await this.prisma.postDestination.update({
      where: { id: destinationId },
      data: { status: 'FAILED', error: message.slice(0, 1000) },
    });
    await this.prisma.publicationLog.create({
      data: {
        postId,
        destinationId,
        workspaceId,
        provider,
        status: 'FAILED',
        error: message.slice(0, 1000),
      },
    });
  }

  private async aggregatePostStatus(postId: string): Promise<void> {
    const destinations = await this.prisma.postDestination.findMany({ where: { postId } });
    const published = destinations.filter((d) => d.status === 'PUBLISHED');
    const failed = destinations.filter((d) => d.status === 'FAILED');
    const pending = destinations.filter(
      (d) => d.status === 'PENDING' || d.status === 'PROCESSING',
    );

    let status: 'PUBLISHED' | 'PARTIAL' | 'FAILED' | 'PROCESSING' = 'PROCESSING';
    if (published.length && !failed.length && !pending.length) status = 'PUBLISHED';
    else if (published.length && (failed.length || pending.length)) status = 'PARTIAL';
    else if (!published.length && (failed.length || !pending.length)) status = 'FAILED';

    const errors = failed
      .map((d) => `${d.accountDisplayName}: ${d.error || 'falha'}`)
      .join(' | ')
      .slice(0, 1000);

    await this.prisma.post.update({
      where: { id: postId },
      data: {
        status,
        publishedAt: published.length ? new Date() : undefined,
        failureReason: errors || null,
      },
    });
  }

  private async currentPostStatus(postId: string): Promise<string> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { status: true } });
    return post?.status ?? 'FAILED';
  }
}
