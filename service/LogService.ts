
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

  /** Logs a message at `info` level */
  public info(message: string | object): void {
    this.winstonLogger.info(message);
  }
  /** Logs a message at `error` level */
  public error(message: string | object): void {
    this.winstonLogger.error(message);
  }
  /** Logs a message at `warn` level */
  public warn(message: string | object): void {
    this.winstonLogger.warn(message);
  }
}

export { LogLevel };
