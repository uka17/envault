export default {
  port: 9000,
  logLevel: process.env.LOG_LEVEL == "INFO" ? "info" : "warn",
  showLogs: process.env.SHOW_LOGS == "TRUE" ? true : false,
  cors: { origin: "http://localhost:8080" },
  session: {
    secret: "biteme",
    cookie: { maxAge: 60000 }, //milliseconds
    resave: false,
    saveUninitialized: false,
  },
  version: "v1",
  passwordRegExp: /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/gm,
  nameRegExp: /^[a-z0-9]+$/i,
  emailRegExp: /.+@.+\..+/i,
  JWTMaxAge: 60, //days
  currentIp: () => {
    const os = require("os");
    const networkInterfaces = os.networkInterfaces();

    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
    return undefined;
  },
};
