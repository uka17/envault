"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
const Language_1 = require("./Language");
const TextLanguage_1 = require("./TextLanguage");
const Text_1 = require("./Text");
const appDataSource = new typeorm_1.DataSource({
    type: "postgres",
    url: process.env.DB,
    database: "custodian",
    entities: [User_1.User, Language_1.Language, Text_1.Text, TextLanguage_1.TextLanguage],
    synchronize: true,
    logging: false,
    connectTimeoutMS: 10000,
});
exports.default = appDataSource;
//# sourceMappingURL=dataSource.js.map