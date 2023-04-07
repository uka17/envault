"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    port: 3000,
    logLevel: "info",
    cors: { origin: "http://localhost:9000" },
    session: {
        secret: "biteme",
        cookie: { maxAge: 60000 },
        resave: false,
        saveUninitialized: false,
    },
};
//# sourceMappingURL=config.js.map