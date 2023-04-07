"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
const winston_1 = __importStar(require("winston"));
const { combine, timestamp, colorize, printf, logstash } = winston_1.default.format;
const winston_transport_1 = __importDefault(require("winston-transport"));
var LogLevel;
(function (LogLevel) {
    LogLevel["Info"] = "info";
    LogLevel["Warn"] = "warn";
    LogLevel["Error"] = "error";
    LogLevel["Http"] = "http";
    LogLevel["Verbose"] = "verbose";
    LogLevel["Debug"] = "debug";
    LogLevel["Silly"] = "silly";
})(LogLevel || (LogLevel = {}));
exports.LogLevel = LogLevel;
class databaseTransport extends winston_transport_1.default {
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
class Logger {
    constructor() { }
    /**
     * Returns singleton instance of `Logger`
     * @param {boolean} silent Should instance show debug information or not, `false` by default
     * @param {LogLevel} logLevel Log only if `info.level` is less than or equal to this level (see https://github.com/winstonjs/winston#logging-levels), `LogLevel.Info` by default
     * @returns {Logger} `Logger` instance
     */
    static getInstance(silent = false, logLevel = LogLevel.Info) {
        if (!Logger.instance) {
            Logger.instance = new Logger();
            Logger.instance.winstonLoggger = (0, winston_1.createLogger)({
                level: logLevel,
                silent: !silent,
                format: combine(colorize({
                    colors: { info: "blue", error: "red", warning: "orange" },
                }), timestamp(), printf(({ level, message, timestamp }) => {
                    return `${timestamp} [${level}]: ${message}`;
                })),
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
        }
        return Logger.instance;
    }
    info(message) {
        this.winstonLoggger.info(message);
    }
    error(message) {
        this.winstonLoggger.error(message);
    }
    warn(message) {
        this.winstonLoggger.warn(message);
    }
}
exports.default = Logger;
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map