import winston from "winston";
const { combine, timestamp, colorize, printf, logstash } = winston.format;
import Transport from "winston-transport";

enum LogMessageLevel {
  info = "info",
  warn = "warn",
  error = "error",
}

/* istanbul ignore next */
class peonDBTransport extends Transport {
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

export default class LogDispatcher {
  private static instance: LogDispatcher;
  private _debug = false;
  private _logLevel = "info";

  private constructor(debug?: boolean, logLevel?: string) {
    this._debug = debug ?? false;
    this._logLevel = logLevel ?? "info";
  }

  /**
   * Puts error to peon database (or logstash if needed)
   * @param {any} message Object to be logged as error
   * @param {LogMessageLevel} level Severity of message
   */
  private putLogstashMessage(message: any, level: LogMessageLevel): void {
    //Actually it puts log messages to peon database, but not to logstash, but using this method it is possible to rebuild it to logstash needs

    const logstashLogger = winston.createLogger({
      level: this._logLevel,
      format: combine(timestamp(), logstash()),
      transports: [new peonDBTransport()],
    });

    this.log(message, level, logstashLogger);
  }

  /**
   * Puts error to files logs and console
   * @param {any} message Object to be logged as error
   * @param {LogMessageLevel} level Severity of message
   */
  private putDebugMessage(message: any, level: LogMessageLevel): void {
    const errorLogger = winston.createLogger({
      level: this._logLevel,
      format: combine(
        colorize({ colors: { info: "blue", error: "red", warning: "orange" } }),
        timestamp(),
        this.runFormat
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
    this.log(message, level, errorLogger);
  }

  /**
   * Classifies the mssage based on severity and put it into winston logger
   * @param {any} message Object to be logged as error
   * @param {LogMessageLevel} level Severity of message
   */
  private log(
    message: any,
    level: LogMessageLevel,
    logger: winston.Logger
  ): void {
    switch (level) {
      case LogMessageLevel.info:
        logger.info(message);
        break;
      case LogMessageLevel.warn:
        logger.warn(message);
        break;
      case LogMessageLevel.error:
        logger.error(message);
        break;
      default:
        logger.error(message);
        break;
    }
  }

  /**
   * Returns singleton instance of debug dispatcher. `debug` and `logLevel` will be reset to new values if provided
   * @param {boolean} debug Should instance show debug information or not
   * @param {string} logLevel Log level to be included into scope (see https://github.com/winstonjs/winston#logging-levels)
   * @returns {LogDispatcher} Dispatcher log instacne
   */
  public static getInstance(debug?: boolean, logLevel?: string): LogDispatcher {
    if (!LogDispatcher.instance) {
      LogDispatcher.instance = new LogDispatcher(debug, logLevel);
    }

    LogDispatcher.instance._debug = debug ?? false;
    LogDispatcher.instance._logLevel = logLevel ?? "info";

    return LogDispatcher.instance;
  }

  /* istanbul ignore next */
  /** Log message formating */
  private runFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
  });

  /* istanbul ignore next */
  /**
   * Creates log entry for provided object
   * @param {any} message Object to be logged
   */
  public error = (message: any) => {
    if (this._debug) this.putDebugMessage(message, LogMessageLevel.error);
    this.putLogstashMessage(message, LogMessageLevel.error);
  };
  /* istanbul ignore next */
  /**
   * Creates warning entry for provided object
   * @param {any} message Object to be logged
   */
  public warn = (message: any) => {
    if (this._debug) this.putDebugMessage(message, LogMessageLevel.warn);
    this.putLogstashMessage(message, LogMessageLevel.error);
  };
  /* istanbul ignore next */
  /**
   * Creates info entry for provided object
   * @param {any} message Object to be logged
   */
  public info = (message: any) => {
    if (this._debug) this.putDebugMessage(message, LogMessageLevel.info);
    this.putLogstashMessage(message, LogMessageLevel.error);
  };
  /* istanbul ignore next */
  /**
   * Outputs log message
   * @param {any} message Object to be logged
   */
  public console = (message: any) => {
    this.putDebugMessage(message, LogMessageLevel.info);
  };
}
