import { injectable, inject } from "tsyringe";
import { Request, Response, NextFunction } from "express";
import passport from "passport";

import { TOKENS } from "#di/tokens.js";
import { CODES, MESSAGES } from "#common/constants.js";
import config from "api/src/config/config.js";

import User from "#model/User.js";

import TranslationService from "#service/TranslationService.js";
import UserService from "#service/UserService.js";
import LogService from "#service/LogService.js";
import ApiError from "api/src/error/ApiError.js";

const REFRESH_COOKIE = config.refreshCookieName;

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: config.JWTRefreshMaxAgeDays * 24 * 60 * 60 * 1000,
  path: "/",
};

@injectable()
export default class UserController {
  constructor(
    @inject(TOKENS.UserService) private userService: UserService,
    @inject(TOKENS.TranslationService) private translationService: TranslationService,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Register new user
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name } = req.body as {
        email: string;
        password: string;
        name: string;
      };
      const user = req.user as User;

      const newUser = new User();
      newUser.name = name;
      newUser.email = email;
      newUser.password = this.userService.getPasswordHash(password);
      newUser.createdBy = user;
      newUser.modifiedBy = user;

      const createdUser = await this.userService.createUser(newUser);

      if (createdUser !== null) {
        return res.status(CODES.API_CREATED).json(createdUser);
      } else {
        throw new Error(MESSAGES.USER_WAS_NOT_CREATED);
      }
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Login user — returns access token in JSON and sets refresh token in HttpOnly cookie
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async login(req: Request, res: Response, next: NextFunction) {
    try {
      return passport.authenticate(
        "local",
        { session: false },
        async(err: Error, passportUser: User) => {
          /* istanbul ignore next */ if (err) {
            this.logger.error(err as object);
            return res
              .status(CODES.SERVER_ERROR)
              .send({ error: this.translationService.getText("error_500") });
          }

          if (passportUser) {
            const accessToken = this.userService.createToken(passportUser);
            const refreshToken = await this.userService.createRefreshToken(passportUser);
            res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS);
            return res.json({ token: accessToken });
          }

          return res.status(CODES.API_UNAUTHORIZED).json({
            error: this.translationService.getText("incorrect_password_or_email"),
          });
        },
      )(req, res, next);
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Issue new access token using refresh token from HttpOnly cookie
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];
      if (!raw) {
        return res.status(CODES.API_UNAUTHORIZED).json({
          error: this.translationService.getText("incorrect_token"),
        });
      }

      const user = await this.userService.verifyRefreshToken(raw);
      if (!user) {
        res.clearCookie(REFRESH_COOKIE, { path: "/" });
        return res.status(CODES.API_UNAUTHORIZED).json({
          error: this.translationService.getText("incorrect_token"),
        });
      }

      const accessToken = this.userService.createToken(user);
      const newRefreshToken = await this.userService.createRefreshToken(user);
      res.cookie(REFRESH_COOKIE, newRefreshToken, REFRESH_COOKIE_OPTIONS);
      return res.json({ token: accessToken });
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Logout user — revokes refresh token and clears cookie
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as User;
      await this.userService.revokeRefreshToken(user.id);
      res.clearCookie(REFRESH_COOKIE, { path: "/" });
      return res.status(CODES.API_OK).json({});
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Update the current user's profile (name and/or email)
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const id = (req.user as User).id;
      const { name, email } = req.body as { name?: string; email?: string };
      const updated = await this.userService.updateProfile(id, { name, email });
      return res.status(CODES.API_OK).json(updated);
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Change the current user's password after verifying the current one
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async updatePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const id = (req.user as User).id;
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };
      const success = await this.userService.updatePassword(id, currentPassword, newPassword);
      if (!success) {
        return res.status(CODES.API_REQUEST_VALIDATION_ERROR).json({
          error: this.translationService.getText("incorrect_current_password"),
        });
      }
      return res.status(CODES.API_OK).json({});
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Returns currently logged in user
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async whoami(req: Request, res: Response, next: NextFunction) {
    try {
      const id = (req.user as User).id;

      const result = await this.userService.getUserById(id);

      /* istanbul ignore next */ if (result === null) {
        throw new ApiError(CODES.API_UNAUTHORIZED, MESSAGES.API_UNAUTHORIZED_ERROR, [
          this.translationService.getText("incorrect_token"),
        ]);
      } else {
        return res.status(CODES.API_OK).json(result);
      }
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }
}
