import { injectable, inject } from "tsyringe";
import { Request, Response, NextFunction } from "express";
import passport from "passport";
import { instanceToPlain } from "class-transformer";

import { TOKENS } from "#di/tokens.js";
import { CODES, MESSAGES } from "#common/constants.js";
import config from "api/src/config/config.js";

import User from "#model/User.js";

import UserService from "#service/UserService.js";
import EmailChangeService from "#service/EmailChangeService.js";
import EmailVerificationService from "#service/EmailVerificationService.js";
import LogService from "#service/LogService.js";
import ApiError from "api/src/error/ApiError.js";

const REFRESH_COOKIE = config.refreshCookieName;

/**
 * Strip the IPv4-mapped IPv6 prefix (e.g. "::ffff:192.168.2.102" -> "192.168.2.102")
 * @param ip Raw IP address string
 * @returns Normalized IP address
 */
function normalizeIp(ip: string | undefined): string | undefined {
  return ip?.replace(/^::ffff:/, "");
}

/**
 * Build options of the refresh token cookie. `secure` is evaluated on each call and follows the
 * runtime `ENV` from `.env` (`PROD` only), so the same image works in every environment
 * @returns Cookie options
 */
export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.environment === "PROD",
    sameSite: "strict" as const,
    maxAge: config.JWTRefreshMaxAgeDays * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

@injectable()
export default class UserController {
  constructor(
    @inject(TOKENS.UserService) private userService: UserService,
    @inject(TOKENS.EmailVerificationService) private emailVerificationService: EmailVerificationService,
    @inject(TOKENS.EmailChangeService) private emailChangeService: EmailChangeService,
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
      newUser.emailVerifiedAt = null;
      newUser.createdBy = user;
      newUser.modifiedBy = user;

      const createdUser = await this.userService.createUser(newUser);

      if (createdUser !== null) {
        await this.emailVerificationService.createAndSend(createdUser);
        return res.status(CODES.API_CREATED).json(instanceToPlain(createdUser));
      } else {
        throw new Error(MESSAGES.USER_WAS_NOT_CREATED);
      }
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Login user: returns access token in JSON and sets refresh token in HttpOnly cookie
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
            return next(ApiError.fromCode(CODES.SERVER_ERROR, "error_500"));
          }

          try {
            if (passportUser) {
              if (!passportUser.emailVerifiedAt) {
                return next(ApiError.fromCode(CODES.API_FORBIDDEN, "email_not_verified"));
              }

              const { raw, sessionId } = await this.userService.createRefreshToken(passportUser, {
                userAgent: req.headers["user-agent"],
                ip: normalizeIp(req.ip),
              });
              const accessToken = this.userService.createToken(passportUser, sessionId);
              res.cookie(REFRESH_COOKIE, raw, getRefreshCookieOptions());
              return res.json({ token: accessToken });
            }

            return next(ApiError.fromCode(CODES.API_UNAUTHORIZED, "incorrect_password_or_email"));
          } catch (error) {
            return next(error);
          }
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
        throw ApiError.fromCode(CODES.API_UNAUTHORIZED, "incorrect_token");
      }

      const result = await this.userService.verifyRefreshToken(raw);
      if (!result) {
        res.clearCookie(REFRESH_COOKIE, { path: "/" });
        throw ApiError.fromCode(CODES.API_UNAUTHORIZED, "incorrect_token");
      }

      const accessToken = this.userService.createToken(result.user, result.session.id);
      res.cookie(REFRESH_COOKIE, result.raw, getRefreshCookieOptions());
      return res.json({ token: accessToken });
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Logout user: revokes refresh token and clears cookie
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as User & { sessionId?: number };
      if (user.sessionId) {
        await this.userService.revokeRefreshToken(user.sessionId);
      }
      res.clearCookie(REFRESH_COOKIE, { path: "/" });
      return res.status(CODES.API_OK).json({});
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Updates the current user's display name. Applies immediately, no confirmation required.
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async updateName(req: Request, res: Response, next: NextFunction) {
    try {
      const id = (req.user as User).id;
      const { name } = req.body as { name: string };
      const updated = await this.userService.updateName(id, name);
      return res.status(CODES.API_OK).json(instanceToPlain(updated));
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Requests an email change for the current user. The current address stays active
   * and logged in until the confirmation link is used.
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async requestEmailChange(req: Request, res: Response, next: NextFunction) {
    try {
      const id = (req.user as User).id;
      const { email } = req.body as { email: string };
      const updated = await this.emailChangeService.request(id, email);
      return res.status(CODES.API_OK).json(instanceToPlain(updated));
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Confirms a new address and clears the now-revoked refresh cookie.
   * @param req Request containing the token
   * @param res Response
   * @param next Error handler
   * @returns HTTP response
   */
  public async confirmEmailChange(req: Request, res: Response, next: NextFunction) {
    try {
      await this.emailChangeService.confirm(req.body.token);
      res.clearCookie(REFRESH_COOKIE, { path: "/" });
      return res.status(200).json({});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resends the authenticated user's pending email confirmation.
   * @param req Authenticated request
   * @param res Response
   * @param next Error handler
   * @returns HTTP response
   */
  public async resendEmailChange(req: Request, res: Response, next: NextFunction) {
    try {
      await this.emailChangeService.request((req.user as User).id, undefined, true);
      return res.status(200).json({});
    } catch (error) {
      next(error);
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
        throw ApiError.fromCode(CODES.API_REQUEST_VALIDATION_ERROR, "incorrect_current_password");
      }
      res.clearCookie(REFRESH_COOKIE, { path: "/" });
      return res.status(CODES.API_OK).json({});
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * List active sessions for the current user, flagging which one is the current session
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async listSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as User & { sessionId?: number };
      const sessions = await this.userService.getUserSessions(user.id);
      const result = sessions.map((session) => ({
        ...instanceToPlain(session),
        current: session.id === user.sessionId,
      }));
      return res.status(CODES.API_OK).json(result);
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Terminate a single session belonging to the current user
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as User;
      const sessionId = parseInt(req.params.id);
      const revoked = await this.userService.revokeSessionForUser(user.id, sessionId);
      if (!revoked) {
        throw ApiError.fromCode(CODES.API_NOT_FOUND, "session_not_found");
      }
      return res.status(CODES.API_OK).json({});
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Terminate every session of the current user except the one currently in use
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async revokeOtherSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as User & { sessionId?: number };
      if (user.sessionId) {
        await this.userService.revokeOtherSessions(user.id, user.sessionId);
      }
      return res.status(CODES.API_OK).json({});
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Verify a user's email using a code received by email. Activates the account
   * so it can subsequently log in.
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.body as { code: string };
      const user = await this.emailVerificationService.verify(code);
      if (!user) {
        throw ApiError.fromCode(CODES.API_UNAUTHORIZED, "verification_code_invalid");
      }
      return res.status(CODES.API_OK).json({});
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Resend a verification email. Always responds with success regardless of whether
   * the address is registered or already verified, to avoid leaking account existence.
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body as { email: string };
      await this.emailVerificationService.resend(email);
      return res.status(CODES.API_OK).json({});
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }

  /**
   * Requests a reset email without revealing whether the account exists.
   * @param req Request containing the email address
   * @param res Response object
   * @param next Error handler
   * @returns HTTP response or forwarded error
   */
  public async requestPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const retryAfter = await this.userService.requestPasswordReset(req.body.email);
      if (retryAfter) {
        res.setHeader("Retry-After", retryAfter);
        return next(ApiError.fromCode(429, "password_reset_rate_limited"));
      }
      return res.status(CODES.API_OK).json({});
    } catch {
      this.logger.error("Password reset request failed");
      return next(ApiError.fromCode(CODES.SERVER_ERROR, "error_500"));
    }
  }

  /**
   * Changes a password using a one-time token and clears the refresh cookie.
   * @param req Request containing token and newPassword
   * @param res Response object
   * @param next Error handler
   * @returns HTTP response or forwarded error
   */
  public async confirmPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const changed = await this.userService.confirmPasswordReset(req.body.token, req.body.newPassword);
      if (!changed) {
        return next(ApiError.fromCode(400, "password_reset_invalid"));
      }
      res.clearCookie(REFRESH_COOKIE, { path: "/" });
      return res.status(CODES.API_OK).json({});
    } catch {
      this.logger.error("Password reset confirmation failed");
      return next(ApiError.fromCode(CODES.SERVER_ERROR, "error_500"));
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
        throw ApiError.fromCode(CODES.API_UNAUTHORIZED, "incorrect_token");
      } else {
        return res.status(CODES.API_OK).json(instanceToPlain(result));
      }
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }
}
