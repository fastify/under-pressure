import {
  FastifyPlugin,
  RawServerBase,
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyLoggerOptions
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
  }
}

declare module "fastify" {
  interface FastifyInstance<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    Logger = FastifyLoggerOptions<RawServer>
    > {
    memoryUsage(): string;
  }
}

declare let underPressure: FastifyPlugin<
  underPressure.UnderPressureOptions
>;

export default underPressure;
