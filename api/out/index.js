"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const logDispatcher_1 = __importDefault(require("./lib/logDispatcher"));
const log = logDispatcher_1.default.getInstance(true, "info");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT;
app.get("/", (req, res) => {
    res.send("Custodian");
});
app.listen(port, () => {
    log.console(`Service is live on ${port}.`);
});
//# sourceMappingURL=index.js.map