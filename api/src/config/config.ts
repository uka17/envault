export default {
  port: 9000,
  logLevel: "info",
  cors: { origin: "http://localhost:8080" },
  session: {
    secret: "biteme",
    cookie: { maxAge: 60000 }, //milliseconds
    resave: false,
    saveUninitialized: false,
  },
  version: "v1.0",
  passwordRegExp: /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/gm,
  nameRegExp: /^[a-z0-9]+$/i,
  emailRegExp: /.+@.+\..+/i,
  JWTMaxAge: 60, //days
};
