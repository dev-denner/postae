import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CalendarQuery {
  from: string;
  to: string;
  platform?: string;
  status?: string;
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getPosts(query: CalendarQuery) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const where: any = {
      workspaceId: 'default',
      publishAt: { gte: from, lte: to },
    };
    if (query.platform) {
      where.socialAccount = { provider: query.platform };
    }
    if (query.status) where.status = query.status;

    const posts = await this.prisma.post.findMany({
      where,
      orderBy: { publishAt: 'asc' },
      include: { media: { include: { media: true } }, socialAccount: true },
    });
    const days = new Map<string, typeof posts>();
    for (const post of posts) {
      if (!post.publishAt) continue;
      const key = post.publishAt.toISOString().slice(0, 10);
      const bucket = days.get(key) ?? [];
      bucket.push(post);
      days.set(key, bucket);
    }
    const result: Array<{ date: string; posts: typeof posts }> = [];
    for (const [date, dayPosts] of [...days.entries()].sort()) {
      result.push({ date, posts: dayPosts });
    }
    return { from: from.toISOString(), to: to.toISOString(), days: result };
  }
}
