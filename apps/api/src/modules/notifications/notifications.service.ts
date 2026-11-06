import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  channel?: string;
  payload?: any;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        channel: input.channel ?? 'WEB',
        payload: input.payload ?? {},
      },
    });
    return notification;
  }

  async listByUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    if (notification.userId !== userId) throw new Error('NOTIFICATION_FORBIDDEN');
    return notification;
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }
}
