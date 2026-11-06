import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SocialController } from './social.controller';
import { SocialOAuthController } from './social-oauth.controller';
import { SocialOAuthService } from './social-oauth.service';
import { SocialService } from './social.service';
import { SocialTokenService } from './social-token.service';
import { SocialProviderRegistry } from './providers/provider.registry';

@Module({
  imports: [PrismaModule],
  controllers: [SocialController, SocialOAuthController],
  providers: [
    SocialProviderRegistry,
    SocialTokenService,
    SocialOAuthService,
    SocialService,
  ],
  exports: [SocialService, SocialProviderRegistry, SocialTokenService],
})
export class SocialModule {}
