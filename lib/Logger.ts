/* istanbul ignore file */
import winston, { createLogger } from "winston";
import { injectable } from "tsyringe";
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
@injectable()
export default class Logger {
  private winstonLoggger: winston.Logger;

  /**
   * Returns singleton instance of `Logger`
   * @param {boolean} silent Should instance show debug information or not, `false` by default
   * @param {LogLevel} logLevel Log only if `info.level` is less than or equal to this level (see https://github.com/winstonjs/winston#logging-levels), `LogLevel.Info` by default
   * @returns {Logger} `Logger` instance
   */
  constructor(silent: boolean = false, logLevel: LogLevel = LogLevel.Info) {
    this.winstonLoggger = createLogger({
      level: logLevel,
      silent: !silent,
      format: combine(
        colorize({
          colors: { info: "blue", error: "red", warning: "orange" },
        }),

        timestamp(),
        printf(({ level, message, timestamp, stack }) => {
          return `${timestamp} [${level}]: ${stack || message}`;
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
