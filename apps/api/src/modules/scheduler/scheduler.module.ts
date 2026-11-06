import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SocialModule } from '../social/social.module';
import { MediaModule } from '../media/media.module';
import { SchedulerService } from './scheduler.service';
import { PublishProcessor } from './processors/publish.processor';
import {
  PUBLISH_QUEUE,
  PUBLISH_QUEUE_TOKEN,
  REDIS_CONNECTION,
  RedisConnectionConfig,
} from './constants';

function redisConfiguration(): RedisConnectionConfig {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const database = parsed.pathname.replace('/', '');
      return {
        connection: {
          host: parsed.hostname,
          port: Number(parsed.port || 6379),
          username: parsed.username || undefined,
          password: parsed.password || undefined,
          db: database ? Number(database) : undefined,
          tls: parsed.protocol === 'rediss:' ? {} : undefined,
        },
      };
    } catch {
      // Cai no formato host/port abaixo se a URL estiver malformada.
    }
  }

  return {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    },
  };
}

@Module({
  imports: [PrismaModule, SocialModule, MediaModule],
  providers: [
    {
      provide: REDIS_CONNECTION,
      useFactory: redisConfiguration,
    },
    {
      provide: PUBLISH_QUEUE_TOKEN,
      useFactory: (connection: any) => new Queue(PUBLISH_QUEUE, connection),
      inject: [REDIS_CONNECTION],
    },
    SchedulerService,
    PublishProcessor,
  ],
  exports: [SchedulerService, PUBLISH_QUEUE_TOKEN],
})
export class SchedulerModule {}
