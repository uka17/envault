export default {
  port: 3000,
  logLevel: "info",
  cors: { origin: "http://localhost:9000" },
  session: {
    secret: "biteme",
    cookie: { maxAge: 60000 }, //milliseconds
    resave: false,
    saveUninitialized: false,
  },
};
