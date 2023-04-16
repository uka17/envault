"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const passport_1 = __importDefault(require("passport"));
const passport_local_1 = __importDefault(require("passport-local"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const User_1 = require("../model/User");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const passport_jwt_1 = require("passport-jwt");
/**
 * Configure passport `Local` and `JWT` policies
 * @param appDataSource Database connection instance
 * @param translations Translations instance
 */
function default_1(appDataSource, translations) {
    const userRepository = appDataSource.getRepository(User_1.User);
    // Set up Local strategy
    passport_1.default.use(new passport_local_1.default.Strategy({
        usernameField: "email",
        passwordField: "password",
    }, async (username, password, done) => {
        const user = await userRepository.findOneBy({
            email: username,
        });
        if (!user) {
            return done(null, false, {
                message: translations.getText("incorrect_token"),
            });
        }
        bcryptjs_1.default.compare(password, user.password, (err, res) => {
            if (err) {
                return done(err);
            }
            if (!res) {
                return done(null, false, {
                    message: translations.getText("incorrect_token"),
                });
            }
            return done(null, user);
        });
    }));
    // Set up JWT strategy
    passport_1.default.use(new passport_jwt_1.Strategy({
        jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.JWT_SECRET,
    }, async (payload, done) => {
        const user = await userRepository.findOneBy({
            id: payload.sub,
        });
        if (!user) {
            return done(null, false);
        }
        return done(null, user);
    }));
}
exports.default = default_1;
//# sourceMappingURL=passport.js.map