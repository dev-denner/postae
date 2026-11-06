export const PUBLISH_QUEUE = 'publish-queue';
export const PUBLISH_JOB = 'publish';
export const PUBLISH_QUEUE_TOKEN = 'PUBLISH_QUEUE';
export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

export interface RedisConnectionConfig {
  connection: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    db?: number;
    tls?: Record<string, unknown>;
  };
}
