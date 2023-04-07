"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appDataSource = void 0;
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.appDataSource = new typeorm_1.DataSource({
    type: "postgres",
    url: process.env.DB,
    database: "custodian",
    entities: [User_1.User],
    synchronize: true,
    logging: false,
});
//# sourceMappingURL=dataSource.js.map