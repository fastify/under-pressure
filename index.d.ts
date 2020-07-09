import {
  FastifyPlugin
} from "fastify";

declare namespace underPressure {
  interface UnderPressureOptions {
    maxEventLoopDelay?: number;
    maxHeapUsedBytes?: number;
    maxRssBytes?: number;
    message?: string;
    retryAfter?: number;
    healthCheck?: () => Promise<boolean>;
    healthCheckInterval?: number;
    sampleInterval?: number;
    exposeStatusRoute?: boolean | string | { routeOpts: object; url?: string };
    customError?: Error;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    memoryUsage(): string;
  }
}

declare let underPressure: FastifyPlugin<
  underPressure.UnderPressureOptions
>;

export default underPressure;
