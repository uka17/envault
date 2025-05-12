/* istanbul ignore next */
export default {
  dbURL: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}` +
    `@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  testDbURL: `postgres://${process.env.TEST_DB_USER}:${process.env.TEST_DB_PASSWORD}` + 
    `@${process.env.TEST_DB_HOST}:${process.env.TEST_DB_PORT}/${process.env.TEST_DB_NAME}`,
  logLevel: "info",
  runInterval: 1000, //ms
  sendFrom: { name: "envault.me", email: "donotreply@envault.me" },
  readMessageUrl: "localhost/getMessage",
};
