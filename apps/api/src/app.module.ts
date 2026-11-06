import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MediaModule } from './modules/media/media.module';
import { SocialModule } from './modules/social/social.module';
import { PostsModule } from './modules/posts/posts.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BillingModule } from './modules/billing/billing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Em dev o comando roda dentro de apps/api; o .env raiz contém as
      // configurações completas e o .env da API pode sobrescrever chaves locais.
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MediaModule,
    SocialModule,
    PostsModule,
    CalendarModule,
    SchedulerModule,
    AnalyticsModule,
    BillingModule,
    NotificationsModule,
  ],
})
export class AppModule {}
