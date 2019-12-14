import * as http from "http";
import * as fastify from "fastify";

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
    exposeStatusRoute?: boolean | string | {routeOpts: object; url?: string};
  }
}

declare module "fastify" {
  interface FastifyInstance<HttpServer, HttpRequest, HttpResponse> {
    memoryUsage: () => string;
  }
}

declare let underPressure: fastify.Plugin<
  http.Server,
  http.IncomingMessage,
  http.ServerResponse,
  underPressure.UnderPressureOptions
>;

export = underPressure;
