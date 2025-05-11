import passport from "passport";
import local from "passport-local";

import dotenv from "dotenv";
dotenv.config();

import User from "../../../model/User";
import { DataSource } from "typeorm";
import TranslationService from "service/TranslationService";

import bcrypt from "bcryptjs";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";

/**
 * Configure passport `Local` and `JWT` policies
 * @param appDataSource Database connection instance
 * @param translationService Translations instance
 */
export default function(
  appDataSource: DataSource,
  translationService: TranslationService,
) {
  const userRepository = appDataSource.getRepository(User);
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
          return done(null, false, {
            message: translationService.getText("incorrect_token").translation,
          });
        }

        bcrypt.compare(password, user.password, (err, res) => {
          /* istanbul ignore next */ if (err) {
            return done(err);
          }
          /* istanbul ignore next */ if (!res) {
            return done(null, false, {
              message:
                translationService.getText("incorrect_token").translation,
            });
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
        secretOrKey: process.env.API_JWT_SECRET,
      },
      async(payload, done) => {
        const user = await userRepository.findOneBy({
          id: payload.sub,
        });
        /* istanbul ignore next */ if (!user) {
          return done(null, false);
        }
        return done(null, user);
      },
    ),
  );
}
