import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/roles.decorator';
import { SocialOAuthService } from './social-oauth.service';
import { SocialService } from './social.service';

function workspaceOf(user: AuthenticatedUser): string {
  if (!user.workspaceId) {
    throw new BadRequestException(
      'Usuário sem workspace associado. Faça login novamente para selecionar um workspace.',
    );
  }
  return user.workspaceId;
}

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(
    private readonly socialService: SocialService,
    private readonly oauthService: SocialOAuthService,
  ) {}

  @Get('providers')
  providers() {
    return { data: this.socialService.getProviderInfo() };
  }

  @Get('accounts')
  async accounts(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.socialService.listAccounts(workspaceOf(user)) };
  }

  @Post('accounts/:provider/connect')
  async connect(
    @Param('provider') provider: string,
    @Body() body: { returnTo?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.oauthService.start({
      provider,
      workspaceId: workspaceOf(user),
      userId: user.sub,
      returnTo: body?.returnTo,
    });
    return { data: result };
  }

  @Post('accounts/:id/refresh')
  async refresh(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return { data: await this.socialService.refreshAccount(id, workspaceOf(user)) };
  }

  @Delete('accounts/:id')
  async disconnect(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return { data: await this.socialService.disconnectAccount(id, workspaceOf(user)) };
  }
}
