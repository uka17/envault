"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const labels_1 = __importDefault(require("../lib/labels"));
/**
 * Main route. Initiates `GET("/")` and all nested routes
 * @param app Express instance
 * @param logger Logger instance
 * @param connection Database connection instanse
 */
function default_1(app, logger, connection) {
    //Put all routes here
    //...
    app.get("/", (req, res) => __awaiter(this, void 0, void 0, function* () {
        res.send("Custodian is online");
        try {
            yield connection.authenticate();
            console.log("Connection has been established successfully.");
        }
        catch (error) {
            console.error("Unable to connect to the database:", error);
        }
    }));
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