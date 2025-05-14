import os from "os";

/* istanbul ignore next */
export default {
  dbURL: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@` +
    `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  testDbURL: `postgres://${process.env.TEST_DB_USER}:${process.env.TEST_DB_PASSWORD}@` +
    `${process.env.TEST_DB_HOST}:${process.env.TEST_DB_PORT}/${process.env.TEST_DB_NAME}`,
  port: 9000,
  logLevel: process.env.LOG_LEVEL == "INFO" ? "info" : "warn",
  showSQLLogs: process.env.SHOW_SQL_LOGS == "TRUE",
  showLogs: process.env.SHOW_LOGS == "TRUE",
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
  stashNanoId: {
    alphabet: "1234567890abcdef",
    length: 32,
  },
  JWTMaxAge: 60, //days
  currentIp: () => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
    /* istanbul ignore next */
    return undefined;
  },
  logo: `
 _____                            _  _   
| ____| _ __ __   __ __ _  _   _ | || |_ 
|  _|  | '_ \\\\ \\ / // _\` || | | || || __|
| |___ | | | |\\ V /| (_| || |_| || || |_ 
|_____||_| |_| \\_/  \\__,_| \\__,_||_| \\__|
`,
};
