/* istanbul ignore next */
export default {
  dbURL: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}` +
    `@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  dbName: process.env.DB_NAME || "",
  testDbURL: `postgres://${process.env.TEST_DB_USER}:${process.env.TEST_DB_PASSWORD}` + 
    `@${process.env.TEST_DB_HOST}:${process.env.TEST_DB_PORT}/${process.env.TEST_DB_NAME}`,
  testDbName: process.env.TEST_DB_NAME || "",
  logLevel: process.env.LOG_LEVEL == "INFO" ? "info" : "warn",
  showLogs: process.env.SHOW_LOGS == "TRUE",
  loki: {
    host: process.env.LOKI_HOST || "",
    user: process.env.LOKI_USER || "",
    apiKey: process.env.LOKI_API_KEY || "",
  },
  runInterval: 1000, //ms
  sendFrom: { name: "envault.me", email: "donotreply@envault.me" },
  readMessageUrl: "localhost/getMessage",
};
