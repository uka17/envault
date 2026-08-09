
import winston, { createLogger } from "winston";
import LokiTransport from "winston-loki";
import Transport from "winston-transport";
import { injectable } from "tsyringe";
const { combine, timestamp, colorize, printf, json, errors } = winston.format;

enum LogLevel {
  Info = "info",
  Warn = "warn",
  Error = "error",
  Http = "http",
  Verbose = "verbose",
  Debug = "debug",
  Silly = "silly",
}

/** Grafana Cloud Loki connection details used to ship logs off-box */
interface LokiConfig {
  host: string;
  user: string;
  apiKey: string;
}

/**
 * Deep-clones a value through JSON, replacing structures that cannot survive JSON
 * encoding (circular references, `BigInt`) with safe string markers. Used to guarantee
 * that whatever gets handed to winston can always be serialized without throwing or
 * producing malformed output.
 * @param {unknown} value Value to make JSON-safe
 * @returns {unknown} Value guaranteed to round-trip through `JSON.stringify`/`JSON.parse`
 */
function toJsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, val) => {
        if (typeof val === "bigint") {
          return val.toString();
        }
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) {
            return "[Circular]";
          }
          seen.add(val);
        }
        return val;
      }),
    );
  } catch {
    return String(value);
  }
}

/**
 * Normalizes a value passed to `info`/`warn`/`error` into a form safe to hand to
 * winston. `Error` instances are flattened into a plain object up front, since their
 * `message`/`stack` are non-enumerable and would otherwise be silently dropped by any
 * transport-level format that clones `info` via `Object.assign` (see the comment on the
 * logger `format` below). The result is then deep-cloned through {@link toJsonSafe} so a
 * single malformed value (circular reference, `BigInt`, ...) can never break JSON
 * encoding downstream and corrupt an entire batch shipped to Loki.
 * @param {string | object} input Value passed to a logging method
 * @returns {string | object} Value safe to pass to the underlying winston logger
 */
function sanitizeLogInput(input: string | object): string | object {
  if (input instanceof Error) {
    const { message, stack, ...rest } = input as Error & Record<string, unknown>;
    return toJsonSafe({ message, stack, ...rest }) as object;
  }
  if (typeof input === "object" && input !== null) {
    return toJsonSafe(input) as object;
  }
  return input;
}

/** Human-readable format shared by the file and console transports */
const humanReadableFormat = combine(
  timestamp(),
  colorize({
    colors: { info: "blue", error: "red", warning: "orange" },
  }),
  /* istanbul ignore next */
  printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
  }),
);

@injectable()
export default class LogService {
  private winstonLogger: winston.Logger;

  /**
   * Creates instance of `LogService`
   * @param {string} service Name of the process emitting the logs (e.g. `"api"`, `"worker"`), attached as the
   * Loki `service` label so streams from different processes can be told apart in Grafana; `"unknown"` by default
   * @param {boolean} silent When `true`, all log output is suppressed; `false` by default
   * @param {LogLevel} logLevel Log only if `info.level` is less than or equal to this level
   * (see https://github.com/winstonjs/winston#logging-levels), `LogLevel.Info` by default
   * @param {LokiConfig} [loki] Grafana Cloud Loki connection details; when omitted (e.g. in local dev or tests),
   * logs are not shipped anywhere and only the file/console transports are used
   */
  constructor(
    service: string = "unknown",
    silent: boolean = false,
    logLevel: LogLevel = LogLevel.Info,
    loki?: LokiConfig,
  ) {
    const transports: Transport[] = [
      new winston.transports.File({
        filename: "./log/app.log",
        maxFiles: 10,
        maxsize: 1024,
        tailable: true,
        format: humanReadableFormat,
      }),
      new winston.transports.Console({
        format: humanReadableFormat,
      }),
    ];

    if (loki?.host) {
      transports.push(
        new LokiTransport({
          host: loki.host,
          basicAuth: `${loki.user}:${loki.apiKey}`,
          labels: { service, environment: process.env.ENV || "unknown" },
          json: true,
          format: combine(timestamp(), json()),
          replaceTimestamp: true,
          gracefulShutdown: true,
          // Drop a batch that Loki rejects instead of requeuing it forever. Without this,
          // a single malformed/rejected batch blocks every log entry behind it (see
          // winston-loki's Batcher#_requeue), permanently silencing this transport until
          // the process restarts.
          clearOnError: true,
          /* istanbul ignore next */
          onConnectionError: (error) => console.error("Loki connection error:", error),
        }),
      );
    }

    this.winstonLogger = createLogger({
      level: logLevel,
      silent: !silent,
      // Normalizes `Error` instances into a plain object with enumerable
      // `message`/`stack` properties *before* any transport-level format
      // runs. Each transport below has its own `format`, which makes
      // winston-transport clone `info` via `Object.assign({}, info)`
      // before formatting it; since `Error.prototype.message`/`.stack`
      // are non-enumerable, that clone silently drops them unless this
      // logger-level format has already copied them onto enumerable
      // properties first.
      format: errors({ stack: true }),
      transports,
    });
  }

  /**
   * Returns the names of the winston transports this logger currently writes to
   * (e.g. `["File", "Console", "LokiTransport"]`)
   * @returns {string[]} Names of the active transport classes
   */
  public getActiveTransports(): string[] {
    return this.winstonLogger.transports.map((transport) => transport.constructor.name);
  }

  /**
   * Logs a message at `info` level
   * @param {string | object} message Message or object to log; sanitized via {@link sanitizeLogInput}
   * @returns {void} Nothing
   */
  public info(message: string | object): void {
    this.winstonLogger.info(sanitizeLogInput(message));
  }
  /**
   * Logs a message at `error` level
   * @param {string | object} message Message, `Error`, or object to log; sanitized via {@link sanitizeLogInput}
   * @returns {void} Nothing
   */
  public error(message: string | object): void {
    this.winstonLogger.error(sanitizeLogInput(message));
  }
  /**
   * Logs a message at `warn` level
   * @param {string | object} message Message or object to log; sanitized via {@link sanitizeLogInput}
   * @returns {void} Nothing
   */
  public warn(message: string | object): void {
    this.winstonLogger.warn(sanitizeLogInput(message));
  }
}

export { LogLevel };
