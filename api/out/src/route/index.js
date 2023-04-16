"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Main route. Initiates `GET("/")` and all nested routes
 * @param app Express instance
 * @param logger Logger instance
 * @param translations Translations instance
 * @param appDataSource Database connection instance
 */
function default_1(app, logger, translations, appDataSource) {
    app.get("/", async (req, res) => {
        res.send("Boilerplate is online. TypeORM, Passport, Express.js");
    });
    //Default error handlers
    app.use(function (err, req, res, next) {
        if (err) {
            if (err.name === "UnauthorizedError") {
                res.status(401).send({ error: translations.getText("unauthorized") });
            }
            else {
                logger.error(err);
            }
        }
        next();
    });
}
exports.default = default_1;
//# sourceMappingURL=index.js.map