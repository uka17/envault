"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    port: 9000,
    logLevel: "info",
    cors: { origin: "http://localhost:8080" },
    session: {
        secret: "biteme",
        cookie: { maxAge: 60000 },
        resave: false,
        saveUninitialized: false,
    },
    version: "v1.0",
    passwordRegExp: /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/gm,
    emailRegExp: /.+@.+\..+/i,
    JWTMaxAge: 60, //days
};
//# sourceMappingURL=config.js.map