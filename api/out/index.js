"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const logger_1 = require("./lib/logger");
const logger = logger_1.Logger.getInstance(true, process.env.LOGLEVEL);
const app = (0, express_1.default)();
const port = process.env.PORT;
app.get("/", (req, res) => {
    res.send("Custodian is online");
});
app.listen(port, () => {
    logger.info(`Service is live on ${port}.`);
    logger.error(`Service is live on ${port}.`);
    logger.warn(`Service is live on ${port}.`);
});
//# sourceMappingURL=index.js.map