import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PUBLISH_JOB, PUBLISH_QUEUE_TOKEN } from './constants';

export interface EnqueuePostInput {
  postId: string;
  scheduleId: string;
  runAt: Date;
}

@Injectable()
export class SchedulerService {
  constructor(@Inject(PUBLISH_QUEUE_TOKEN) private readonly queue: Queue) {}

  /**
   * Enfileira o post inteiro. O worker carrega conteúdo, mídia e destinos do
   * banco, evitando que dados sensíveis ou desatualizados fiquem no Redis.
   */
  async enqueuePost(input: EnqueuePostInput): Promise<void> {
    const delay = Math.max(0, input.runAt.getTime() - Date.now());
    await this.queue.add(
      PUBLISH_JOB,
      { postId: input.postId, scheduleId: input.scheduleId },
      {
        jobId: `publish-${input.scheduleId}`,
        delay,
        attempts: 1,
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  }

  async cancel(scheduleId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(`publish-${scheduleId}`);
      if (job) {
        await job.remove();
      }
    } catch {
      // Se o Redis estiver indisponível, o cancelamento no banco continua
      // válido e o worker ignorará o post cancelado quando a fila voltar.
    }
  }
}
