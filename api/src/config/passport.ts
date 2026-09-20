import passport from "passport";
import local from "passport-local";

import User from "../../../model/User.js";
import Session from "../../../model/Session.js";
import { DataSource, IsNull, MoreThan } from "typeorm";
import { API_ERROR_MESSAGES } from "#common/errorCodes.js";

import bcrypt from "bcryptjs";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";

/**
 * Configure passport `Local` and `JWT` policies
 * @param appDataSource Database connection instance
 * @param jwtSecret Secret used to verify JWT access tokens
 */
export default function(
  appDataSource: DataSource,
  jwtSecret: string,
) {
  const userRepository = appDataSource.getRepository(User);
  const sessionRepository = appDataSource.getRepository(Session);
  // Set up Local strategy
  passport.use(
    new local.Strategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async(username, password, done) => {
        const user = await userRepository.findOneBy({
          email: username,
        });
        if (!user) {
          return done(null, false, { message: API_ERROR_MESSAGES.incorrect_token });
        }

        bcrypt.compare(password, user.password, (err, res) => {
          /* istanbul ignore next */ if (err) {
            return done(err);
          }
          /* istanbul ignore next */ if (!res) {
            return done(null, false, { message: API_ERROR_MESSAGES.incorrect_token });
          }
          return done(null, user);
        });
      },
    ),
  );
  // Set up JWT strategy
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: jwtSecret,
      },
      async(payload, done) => {
        try {
          const user = await userRepository.findOneBy({
            id: payload.sub,
          });
          /* istanbul ignore next */
          if (!user) {
            return done(null, false);
          }
          // Tokens without `sid` (issued before session binding) and tokens of revoked, expired
          // or foreign sessions are rejected, so revocation takes effect immediately
          if (!payload.sid) {
            return done(null, false);
          }
          const session = await sessionRepository.findOne({
            where: {
              id: payload.sid,
              user: { id: payload.sub },
              revokedAt: IsNull(),
              expiresAt: MoreThan(new Date()),
            },
          });
          if (!session) {
            return done(null, false);
          }
          //This is jsut to avoid creation of seprate object where `sessionID` property added to `User`
          (user as User & { sessionId?: number }).sessionId = session.id;
          return done(null, user);
        } catch (error) {
          // Pass database errors to Express instead of leaving the request hanging
          return done(error);
        }
      },
    ),
  );
}
