import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/roles.decorator';

function workspaceOf(user: AuthenticatedUser): string {
  if (!user.workspaceId) {
    throw new BadRequestException(
      'Usuário sem workspace associado. Faça login novamente para selecionar um workspace.',
    );
  }
  return user.workspaceId;
}

function defaultPeriod(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview(@Query() query: any, @CurrentUser() user: AuthenticatedUser) {
    const period = defaultPeriod();
    const from = query.from || period.from;
    const to = query.to || period.to;
    if (Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
      throw new BadRequestException('Período inválido. Use datas ISO válidas.');
    }
    return {
      data: await this.analyticsService.getOverview(workspaceOf(user), from, to),
    };
  }

  @Get('posts/:id')
  async getPost(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return {
      data: await this.analyticsService.getPostMetrics(workspaceOf(user), id),
    };
  }
}
