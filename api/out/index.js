"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const dataSource_1 = __importDefault(require("./src/model/dataSource"));
const config_1 = __importDefault(require("./src/config/config"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_json_1 = __importDefault(require("./src/swagger/swagger.json"));
const index_1 = __importDefault(require("./src/route/index"));
const user_1 = __importDefault(require("./src/route/user"));
const passport_1 = __importDefault(require("./src/config/passport"));
const Translations_1 = __importDefault(require("./src/lib/Translations"));
const logger_1 = require("./src/lib/logger");
const logger = logger_1.Logger.getInstance(true, config_1.default.logLevel);
const app = (0, express_1.default)();
//TODO separate PROD and DEBUG runs with "const isProduction = process.env.NODE_ENV === 'production'";
app.use((0, cors_1.default)(config_1.default.cors));
app.use((0, express_session_1.default)(config_1.default.session));
app.use(body_parser_1.default.json());
//Basic checks
if (!process.env.JWT_SECRET)
    throw "JWT_SECRET is empty or nor found";
//Swagger
//TODO bring more clarity and details to swagger
//TODO swagger shows paths like "ver/users"
app.use("/swagger", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_json_1.default));
//Init datasourse and configure all routes
dataSource_1.default
    .initialize()
    .then(async () => {
    //Get translations
    const translations = new Translations_1.default();
    await translations.loadTranslations("en");
    //Configure passport policies
    (0, passport_1.default)(dataSource_1.default, translations);
    //Configure all routes
    const router = express_1.default.Router();
    (0, index_1.default)(router, logger, translations, dataSource_1.default);
    (0, user_1.default)(router, logger, translations, dataSource_1.default);
    //Attach routes to app
    app.use(`/api/${config_1.default.version}`, router);
})
    .catch((error) => logger.error(error));
//Start app
app.listen(config_1.default.port, () => {
    logger.info(`Service is live on ${config_1.default.port}.`);
});
//# sourceMappingURL=index.js.map