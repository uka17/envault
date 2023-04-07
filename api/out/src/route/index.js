"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const labels_1 = __importDefault(require("../lib/labels"));
const User_1 = require("../model/User");
/**
 * Main route. Initiates `GET("/")` and all nested routes
 * @param app Express instance
 * @param logger Logger instance
 * @param connection Database connection instance
 */
function default_1(app, logger, appDataSource) {
    //Put all routes here
    //...
    app.get("/", async (req, res) => {
        res.send("Custodian is online");
        // Create a new user
        const jane = new User_1.User();
        jane.name = "Kolyan";
        jane.email = "kot@kot.ru";
        jane.password = "12345";
        await appDataSource.manager.save(jane);
        console.log("Photo has been saved. Photo id is", jane.id);
    });
    //Error handlers
    app.use(function (err, req, res, next) {
        if (err) {
            if (err.name === "UnauthorizedError") {
                res.status(401).send({ error: labels_1.default.notAuthorized });
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