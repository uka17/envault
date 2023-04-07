"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const dataSource_1 = require("./src/model/dataSource");
const config_1 = __importDefault(require("./src/config/config"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_json_1 = __importDefault(require("./src/swagger/swagger.json"));
const index_1 = __importDefault(require("./src/route/index"));
dotenv_1.default.config();
const logger_1 = require("./src/lib/logger");
const logger = logger_1.Logger.getInstance(true, config_1.default.logLevel);
const app = (0, express_1.default)();
//TODO separate PROD and DEBUG runs with "const isProduction = process.env.NODE_ENV === 'production'";
app.use((0, cors_1.default)(config_1.default.cors));
app.use((0, express_session_1.default)(config_1.default.session));
//Swagger
//TODO bring more clarity and details to swagger
app.use("/swagger", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_json_1.default));
/*import passportConfig from "../config/passport";
passportConfig();
*/
dataSource_1.appDataSource
    .initialize()
    .then(() => {
    (0, index_1.default)(app, logger, dataSource_1.appDataSource);
})
    .catch((error) => logger.error(error));
//Start app
app.listen(config_1.default.port, () => {
    logger.info(`Service is live on ${config_1.default.port}.`);
});
//# sourceMappingURL=index.js.map