import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest
} from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    memoryUsage(): { heapUsed: number; rssBytes: number; eventLoopDelay: number; eventLoopUtilized: number };
    isUnderPressure(): boolean;
  }
}

interface FastifyUnderPressureExports {
  TYPE_EVENT_LOOP_DELAY: 'eventLoopDelay'
  TYPE_HEAP_USED_BYTES: 'heapUsedBytes'
  TYPE_RSS_BYTES: 'rssBytes'
  TYPE_HEALTH_CHECK: 'healthCheck'
  TYPE_EVENT_LOOP_UTILIZATION: 'eventLoopUtilization'
}

type FastifyUnderPressure = FastifyPluginAsync<fastifyUnderPressure.UnderPressureOptions> & FastifyUnderPressureExports

declare namespace fastifyUnderPressure {
  export interface UnderPressureOptions {
    maxEventLoopDelay?: number;
    maxEventLoopUtilization?: number;
    maxHeapUsedBytes?: number;
    maxRssBytes?: number;
    message?: string;
    retryAfter?: number;
    healthCheck?: (fastify: FastifyInstance) => Promise<Record<string, unknown> | boolean>;
    healthCheckInterval?: number;
    pressureHandler?: (request: FastifyRequest, reply: FastifyReply, type: string, value: number | undefined) => Promise<void> | void;
    sampleInterval?: number;
    exposeStatusRoute?: boolean | string | { routeOpts: object; routeSchemaOpts?: object; routeResponseSchemaOpts?: object; url?: string };
    customError?: Error;
  }

  export const TYPE_EVENT_LOOP_DELAY = 'eventLoopDelay'
  export const TYPE_HEAP_USED_BYTES = 'heapUsedBytes'
  export const TYPE_RSS_BYTES = 'rssBytes'
  export const TYPE_HEALTH_CHECK = 'healthCheck'
  export const TYPE_EVENT_LOOP_UTILIZATION = 'eventLoopUtilization'

  export const fastifyUnderPressure: FastifyUnderPressure
  export { fastifyUnderPressure as default }
}

declare function fastifyUnderPressure(...params: Parameters<FastifyUnderPressure>): ReturnType<FastifyUnderPressure>
export = fastifyUnderPressure
