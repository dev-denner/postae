import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    const items = await this.notificationsService.listByUser(user.sub);
    return { data: items };
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: any) {
    const count = await this.notificationsService.unreadCount(user.sub);
    return { data: { count } };
  }

  @Post()
  async create(@CurrentUser() user: any, @Query() query: any) {
    const notification = await this.notificationsService.create({
      userId: user.sub,
      type: query.type ?? 'SYSTEM',
      channel: query.channel ?? 'WEB',
      payload: query.payload ?? {},
    });
    return { data: notification };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    const notification = await this.notificationsService.markAsRead(id, user.sub);
    return { data: notification };
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: any) {
    const result = await this.notificationsService.markAllAsRead(user.sub);
    return { data: result };
  }
}
