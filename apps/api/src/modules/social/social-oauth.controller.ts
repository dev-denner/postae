import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SocialOAuthService } from './social-oauth.service';

@Controller('social/oauth')
export class SocialOAuthController {
  constructor(private readonly oauthService: SocialOAuthService) {}

  /**
   * Callback público chamado pelo navegador após a autorização do provedor.
   * A proteção é feita pelo `state` de uso único + PKCE, não por JWT.
   */
  @Get(':provider/callback')
  @Public()
  async callback(
    @Param('provider') provider: string,
    @Query()
    query: { code?: string; state?: string; error?: string; error_description?: string },
    @Res() response: Response,
  ): Promise<void> {
    const redirectUrl = await this.oauthService.handleCallback(provider, query);
    response.redirect(redirectUrl);
  }
}
