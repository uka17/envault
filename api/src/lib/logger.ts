import winston, { createLogger } from "winston";
const { combine, timestamp, colorize, printf, logstash } = winston.format;
import Transport from "winston-transport";

enum LogLevel {
  Info = "info",
  Warn = "warn",
  Error = "error",
  Http = "http",
  Verbose = "verbose",
  Debug = "debug",
  Silly = "silly",
}
class databaseTransport extends Transport {
  constructor(opts?) {
    super(opts);
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit("logged", info);
    });

    // Perform the writing to the remote service
    //---
    //Log stash connect here
    //---
    callback();
  }
}

export default class Logger {
  private static instance: Logger;
  private winstonLoggger: winston.Logger;
  public tet: string;

  private constructor() {}

  /**
   * Returns singleton instance of `Logger`
   * @param {boolean} silent Should instance show debug information or not, `false` by default
   * @param {LogLevel} logLevel Log only if `info.level` is less than or equal to this level (see https://github.com/winstonjs/winston#logging-levels), `LogLevel.Info` by default
   * @returns {Logger} `Logger` instance
   */
  public static getInstance(
    silent: boolean = false,
    logLevel: LogLevel = LogLevel.Info
  ): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
      Logger.instance.winstonLoggger = createLogger({
        level: logLevel,
        silent: !silent,
        format: combine(
          colorize({
            colors: { info: "blue", error: "red", warning: "orange" },
          }),
          timestamp(),
          printf(({ level, message, timestamp }) => {
            return `${timestamp} [${level}]: ${message}`;
          })
        ),
        transports: [
          new winston.transports.File({
            filename: "./log/app.log",
            maxFiles: 10,
            maxsize: 1024,
            tailable: true,
          }),
          new winston.transports.Console(),
        ],
      });
    }

    return Logger.instance;
  }
  public info(message: string | object): void {
    this.winstonLoggger.info(message);
  }
  public error(message: string | object): void {
    this.winstonLoggger.error(message);
  }
  public warn(message: string | object): void {
    this.winstonLoggger.warn(message);
  }
}

export { LogLevel, Logger };
