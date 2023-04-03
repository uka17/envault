"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const { combine, timestamp, colorize, printf, logstash } = winston_1.default.format;
const winston_transport_1 = __importDefault(require("winston-transport"));
var LogMessageLevel;
(function (LogMessageLevel) {
    LogMessageLevel["info"] = "info";
    LogMessageLevel["warn"] = "warn";
    LogMessageLevel["error"] = "error";
})(LogMessageLevel || (LogMessageLevel = {}));
/* istanbul ignore next */
class peonDBTransport extends winston_transport_1.default {
    constructor(opts) {
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
class LogDispatcher {
    constructor(debug, logLevel) {
        this._debug = false;
        this._logLevel = "info";
        /* istanbul ignore next */
        /** Log message formating */
        this.runFormat = printf(({ level, message, timestamp }) => {
            return `${timestamp} [${level}]: ${message}`;
        });
        /* istanbul ignore next */
        /**
         * Creates log entry for provided object
         * @param {any} message Object to be logged
         */
        this.error = (message) => {
            if (this._debug)
                this.putDebugMessage(message, LogMessageLevel.error);
            this.putLogstashMessage(message, LogMessageLevel.error);
        };
        /* istanbul ignore next */
        /**
         * Creates warning entry for provided object
         * @param {any} message Object to be logged
         */
        this.warn = (message) => {
            if (this._debug)
                this.putDebugMessage(message, LogMessageLevel.warn);
            this.putLogstashMessage(message, LogMessageLevel.error);
        };
        /* istanbul ignore next */
        /**
         * Creates info entry for provided object
         * @param {any} message Object to be logged
         */
        this.info = (message) => {
            if (this._debug)
                this.putDebugMessage(message, LogMessageLevel.info);
            this.putLogstashMessage(message, LogMessageLevel.error);
        };
        /* istanbul ignore next */
        /**
         * Outputs log message
         * @param {any} message Object to be logged
         */
        this.console = (message) => {
            this.putDebugMessage(message, LogMessageLevel.info);
        };
        this._debug = debug !== null && debug !== void 0 ? debug : false;
        this._logLevel = logLevel !== null && logLevel !== void 0 ? logLevel : "info";
    }
    /**
     * Puts error to peon database (or logstash if needed)
     * @param {any} message Object to be logged as error
     * @param {LogMessageLevel} level Severity of message
     */
    putLogstashMessage(message, level) {
        //Actually it puts log messages to peon database, but not to logstash, but using this method it is possible to rebuild it to logstash needs
        const logstashLogger = winston_1.default.createLogger({
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
    putDebugMessage(message, level) {
        const errorLogger = winston_1.default.createLogger({
            level: this._logLevel,
            format: combine(colorize({ colors: { info: "blue", error: "red", warning: "orange" } }), timestamp(), this.runFormat),
            transports: [
                new winston_1.default.transports.File({
                    filename: "./log/app.log",
                    maxFiles: 10,
                    maxsize: 1024,
                    tailable: true,
                }),
                new winston_1.default.transports.Console(),
            ],
        });
        this.log(message, level, errorLogger);
    }
    /**
     * Classifies the mssage based on severity and put it into winston logger
     * @param {any} message Object to be logged as error
     * @param {LogMessageLevel} level Severity of message
     */
    log(message, level, logger) {
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
    static getInstance(debug, logLevel) {
        if (!LogDispatcher.instance) {
            LogDispatcher.instance = new LogDispatcher(debug, logLevel);
        }
        LogDispatcher.instance._debug = debug !== null && debug !== void 0 ? debug : false;
        LogDispatcher.instance._logLevel = logLevel !== null && logLevel !== void 0 ? logLevel : "info";
        return LogDispatcher.instance;
    }
}
exports.default = LogDispatcher;
//# sourceMappingURL=logDispatcher.js.map