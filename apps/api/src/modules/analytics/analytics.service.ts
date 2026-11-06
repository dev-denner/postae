import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface OverviewMetrics {
  period: { from: string; to: string };
  totals: {
    scheduled: number;
    published: number;
    failed: number;
    drafts: number;
    processing: number;
    partial: number;
  };
  connectedAccounts: number;
  providers: Array<{
    provider: string;
    published: number;
    failed: number;
    pending: number;
  }>;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    workspaceId: string,
    from: string,
    to: string,
  ): Promise<OverviewMetrics> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const posts = await this.prisma.post.findMany({
      where: { workspaceId },
      select: { status: true, publishAt: true, createdAt: true },
    });
    const inPeriod = posts.filter((post) => {
      const reference = post.publishAt ?? post.createdAt;
      return reference >= fromDate && reference <= toDate;
    });
    const count = (status: string) =>
      inPeriod.filter((post) => post.status === status).length;

    const [connectedAccounts, destinationGroups] = await Promise.all([
      this.prisma.socialAccount.count({
        where: { workspaceId, status: { not: 'DISCONNECTED' } },
      }),
      this.prisma.postDestination.groupBy({
        by: ['provider', 'status'],
        where: { post: { workspaceId } },
        _count: { _all: true },
      }),
    ]);

    const providers = new Map<
      string,
      { provider: string; published: number; failed: number; pending: number }
    >();
    for (const group of destinationGroups) {
      const current = providers.get(group.provider) ?? {
        provider: group.provider,
        published: 0,
        failed: 0,
        pending: 0,
      };
      if (group.status === 'PUBLISHED') current.published += group._count._all;
      else if (group.status === 'FAILED') current.failed += group._count._all;
      else current.pending += group._count._all;
      providers.set(group.provider, current);
    }

    return {
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totals: {
        scheduled: count('SCHEDULED'),
        published: count('PUBLISHED'),
        failed: count('FAILED'),
        drafts: count('DRAFT'),
        processing: count('PROCESSING'),
        partial: count('PARTIAL'),
      },
      connectedAccounts,
      providers: [...providers.values()].sort((a, b) =>
        a.provider.localeCompare(b.provider),
      ),
    };
  }

  async getPostMetrics(workspaceId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, workspaceId },
      select: {
        id: true,
        status: true,
        publishedAt: true,
        destinations: {
          select: {
            provider: true,
            status: true,
            externalPostId: true,
            publishedAt: true,
          },
        },
      },
    });
    if (!post) throw new NotFoundException('Post não encontrado.');
    return {
      postId: post.id,
      status: post.status,
      publishedAt: post.publishedAt,
      destinations: post.destinations,
      // Métricas de engajamento por rede não são coletadas nesta versão.
      impressions: null,
      engagements: null,
      clicks: null,
      views: null,
      reach: null,
    };
  }
}
