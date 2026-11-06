import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  listPlans(@Query() query: any) {
    return { data: this.billingService.listPlans() };
  }

  @Get('subscription')
  async getSubscription(@CurrentUser() user: any) {
    const subscription = await this.billingService.getSubscription(user.sub);
    return { data: subscription };
  }

  @Post('subscribe')
  async subscribe(@CurrentUser() user: any, @Body() body: { planId: string; workspaceId?: string }) {
    const subscription = await this.billingService.subscribe(body.planId, user.sub);
    return { data: subscription };
  }
}
