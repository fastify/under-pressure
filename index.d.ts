import {
  FastifyInstance,
  FastifyPlugin,
  FastifyReply,
  FastifyRequest
} from "fastify";

export const TYPE_EVENT_LOOP_DELAY = 'eventLoopDelay'
export const TYPE_HEAP_USED_BYTES = 'heapUsedBytes'
export const TYPE_RSS_BYTES = 'rssBytes'
export const TYPE_HEALTH_CHECK = 'healthCheck'
export const TYPE_EVENT_LOOP_UTILIZATION = 'eventLoopUtilization'

declare namespace underPressure {
  interface UnderPressureOptions {
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
}

declare module "fastify" {
  interface FastifyInstance {
    memoryUsage(): { heapUsed: number; rssBytes: number; eventLoopDelay: number; eventLoopUtilized: number };
  }
}

declare let underPressure: FastifyPlugin<
  underPressure.UnderPressureOptions
>;

export default underPressure;
