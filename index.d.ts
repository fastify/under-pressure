import {
  FastifyPlugin
} from "fastify";

declare namespace underPressure {
  interface UnderPressureOptions {
    maxEventLoopDelay?: number;
    maxEventLoopUtilization?: number;
    maxHeapUsedBytes?: number;
    maxRssBytes?: number;
    message?: string;
    retryAfter?: number;
    healthCheck?: () => Promise<boolean>;
    healthCheckInterval?: number;
    sampleInterval?: number;
    exposeStatusRoute?: boolean | string | { routeOpts: object; routeSchemaOpts?: object; url?: string };
    customError?: Error;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    memoryUsage(): { heapUsed: number; rssBytes: number; eventLoopDelay: number; eventLoopUtilizationVal: number };
  }
}

declare let underPressure: FastifyPlugin<
  underPressure.UnderPressureOptions
>;

export default underPressure;
