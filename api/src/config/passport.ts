import passport from "passport";
import local from "passport-local";

import dotenv from "dotenv";
dotenv.config();

import { User } from "../model/User";
import { DataSource } from "typeorm";

import Translations from "../lib/Translations";
import bcrypt from "bcryptjs";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";

/**
 * Configure passport `Local` and `JWT` policies
 * @param appDataSource Database connection instance
 * @param translations Translations instance
 */
export default function (
  appDataSource: DataSource,
  translations: Translations
) {
  const userRepository = appDataSource.getRepository(User);
  // Set up Local strategy
  passport.use(
    new local.Strategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (username, password, done) => {
        const user = await userRepository.findOneBy({
          email: username,
        });
        if (!user) {
          return done(null, false, {
            message: translations.getText("incorrect_token"),
          });
        }

        bcrypt.compare(password, user.password, (err, res) => {
          if (err) {
            return done(err);
          }
          if (!res) {
            return done(null, false, {
              message: translations.getText("incorrect_token"),
            });
          }
          return done(null, user);
        });
      }
    )
  );
  // Set up JWT strategy
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.JWT_SECRET,
      },
      async (payload, done) => {
        const user = await userRepository.findOneBy({
          id: payload.sub,
        });
        if (!user) {
          return done(null, false);
        }
        return done(null, user);
      }
    )
  );
}
