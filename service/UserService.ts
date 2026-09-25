import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as crypto from "crypto";
import { injectable, inject } from "tsyringe";
import { EntityManager, IsNull, LessThan, MoreThan, Not, Repository } from "typeorm";

import User from "#model/User.js";
import PasswordResetLimit from "#model/PasswordResetLimit.js";
import EmailService from "#service/EmailService.js";
import ApiError from "api/src/error/ApiError.js";
import { renderResetPassword } from "#common/templates/resetPassword.js";
import Session from "#model/Session.js";
import LogService from "#service/LogService.js";
import config from "api/src/config/config.js";
import { TOKENS } from "#di/tokens.js";

@injectable()
export default class UserService {
  /**
   * Creates instance of `UserService`
   * @param userRepository User repository
   * @param sessionRepository Session repository
   * @param logger Logger service
   * @param emailService Email delivery service
   */
  constructor(
    @inject(TOKENS.UserRepository) private userRepository: Repository<User>,
    @inject(TOKENS.SessionRepository) private sessionRepository: Repository<Session>,
    @inject(TOKENS.LogService) private logger: LogService,
    @inject(TOKENS.EmailService) private emailService: EmailService,
  ) {}

  /**
   * Creates a new user
   * @param newUser User object
   * @returns Created user object or null if error
   */
  public async createUser(newUser: User): Promise<User | null> {
    return await this.userRepository.manager.save(newUser);
  }
  /**
   * Create access token for user (short-lived)
   * @param user User object
   * @param sessionId ID of the session this access token was issued for
   * @returns Signed JWT string
   */
  public createToken(user: User, sessionId?: number): string {
    const expirationDate = new Date();
    expirationDate.setMinutes(expirationDate.getMinutes() + config.JWTAccessMaxAgeMinutes);
    return jwt.sign(
      {
        email: user.email,
        sub: user.id,
        sid: sessionId,
        exp: Math.round(expirationDate.getTime() / 1000),
      },
      process.env.API_JWT_SECRET,
    );
  }

  /**
   * Create a new session for the user (one per device/login) and return its raw refresh token
   * @param user User object
   * @param meta Optional device metadata to attach to the session (user agent, IP)
   * @returns Raw refresh token to be stored in a cookie, and the id of the created session
   */
  public async createRefreshToken(
    user: User,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ raw: string; sessionId: number }> {
    const raw = crypto.randomBytes(64).toString("hex");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.JWTRefreshMaxAgeDays);

    const session = await this.sessionRepository.manager.transaction(async(manager) => {
      const current = await manager.findOne(User, {
        where: { id: user.id }, lock: { mode: "pessimistic_write" },
      });
      // A login can finish password verification before a reset commits.
      if (!current || current.password !== user.password || current.email !== user.email) {
        throw ApiError.fromCode(401, "incorrect_password_or_email");
      }
      return manager.save(Session, manager.create(Session, {
        user: current,
        refreshTokenHash: hash,
        expiresAt,
        userAgent: meta?.userAgent ?? null,
        ip: meta?.ip ?? null,
      }));
    });

    return { raw, sessionId: session.id };
  }

  /**
   * Verify a raw refresh token and rotate it. Also accepts the token that was just
   * replaced by the previous rotation for a short grace period, so that concurrent
   * refresh requests from the same client don't fail one another. Revoked or expired
   * sessions are never accepted, regardless of the grace period.
   * @param raw Raw refresh token from cookie
   * @returns The user, its session and the newly rotated raw token, or null if invalid
   */
  public async verifyRefreshToken(
    raw: string,
  ): Promise<{ user: User; session: Session; raw: string } | null> {
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const now = new Date();

    const session = await this.sessionRepository.findOne({
      where: [
        { refreshTokenHash: hash, revokedAt: IsNull(), expiresAt: MoreThan(now) },
        {
          previousRefreshTokenHash: hash,
          previousTokenExpiresAt: MoreThan(now),
          revokedAt: IsNull(),
          expiresAt: MoreThan(now),
        },
      ],
      relations: { user: true },
    });

    if (!session) {
      return null;
    }

    const newRaw = crypto.randomBytes(64).toString("hex");
    const graceExpiresAt = new Date();
    graceExpiresAt.setMinutes(graceExpiresAt.getMinutes() + config.JWTRefreshGraceMinutes);

    session.previousRefreshTokenHash = session.refreshTokenHash;
    session.previousTokenExpiresAt = graceExpiresAt;
    session.refreshTokenHash = crypto.createHash("sha256").update(newRaw).digest("hex");
    // A password change or logout may have revoked the session after it was read.
    // Update only rotation fields so a stale snapshot cannot restore revokedAt.
    const result = await this.sessionRepository.update(
      { id: session.id, revokedAt: IsNull() },
      {
        previousRefreshTokenHash: session.previousRefreshTokenHash,
        previousTokenExpiresAt: session.previousTokenExpiresAt,
        refreshTokenHash: session.refreshTokenHash,
      },
    );
    if (result.affected !== 1) {
      return null;
    }

    return { user: session.user, session, raw: newRaw };
  }

  /**
   * Immediately revoke a single session, with no grace period
   * @param sessionId Session ID
   */
  public async revokeRefreshToken(sessionId: number): Promise<void> {
    await this.sessionRepository.update(sessionId, { revokedAt: new Date() });
  }

  /**
   * Immediately revoke every active session for a user (logout from all devices)
   * @param userId User ID
   * @param manager Optional entity manager, to run the revocation inside an existing transaction
   */
  public async revokeAllSessions(
    userId: number,
    manager: EntityManager = this.sessionRepository.manager,
  ): Promise<void> {
    await manager.update(
      Session,
      { user: { id: userId }, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * Immediately revoke every active session of a user except the one given (logout from other devices)
   * @param userId User ID
   * @param currentSessionId ID of the session to keep active
   */
  public async revokeOtherSessions(userId: number, currentSessionId: number): Promise<void> {
    await this.sessionRepository.update(
      { user: { id: userId }, revokedAt: IsNull(), id: Not(currentSessionId) },
      { revokedAt: new Date() },
    );
  }

  /**
   * Immediately revoke a single session, but only if it belongs to the given user
   * @param userId User ID that must own the session
   * @param sessionId Session ID
   * @returns true if an active session was found and revoked, false otherwise
   */
  public async revokeSessionForUser(userId: number, sessionId: number): Promise<boolean> {
    const result = await this.sessionRepository.update(
      { id: sessionId, user: { id: userId }, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * Returns every active (non-revoked, non-expired) session for a user, most recently created first
   * @param userId User ID
   * @returns Array of active sessions
   */
  public async getUserSessions(userId: number): Promise<Session[]> {
    return this.sessionRepository.find({
      where: { user: { id: userId }, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdOn: "DESC" },
    });
  }
  /**
   * Returns user by id
   * @param userId User ID
   * @returns User or `null` if not found or error
   */
  public async getUserById(userId: number): Promise<User | null> {
    try {
      return await this.userRepository.findOne({
        where: {
          id: userId,
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
  /**
   * Returns user by email
   * @param email User email
   * @returns User or `null` if not found or error
   */
  public async getUserByEmail(email: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({
        where: {
          email: email,
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Updates a user's display name. Email changes go through EmailChangeService instead,
   * since they require a confirmation token and are not a plain field update.
   * @param userId User ID
   * @param name New display name
   * @returns Updated user without password, or null if user not found
   */
  public async updateName(userId: number, name: string): Promise<User | null> {
    await this.userRepository.update(userId, { name, modifiedOn: new Date() });
    return this.getUserById(userId);
  }

  /**
   * Changes a user's password after verifying the current password and revokes all of the
   * user's sessions (including the current one), so every access and refresh token stops working.
   * The password update and the revocation run in one transaction, so a failed revocation
   * rolls back the password change.
   * @param userId User ID
   * @param currentPassword Plain-text current password to verify
   * @param newPassword Plain-text new password to set
   * @returns true if password was changed, false if current password is incorrect or user not found
   */
  public async updatePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    return this.userRepository.manager.transaction(async(manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId }, lock: { mode: "pessimistic_write" },
      });
      if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
        return false;
      }
      await manager.update(User, userId, {
        password: this.getPasswordHash(newPassword), modifiedOn: new Date(),
        passwordResetTokenHash: null, passwordResetExpiresAt: null, passwordResetEmail: null,
      });
      await this.revokeAllSessions(userId, manager);
      return true;
    });
  }

  /**
   * Reserves an address budget and replaces the reset token for a verified account.
   * Unknown and unverified addresses consume the same persistent budget. Email delivery
   * starts after commit without being awaited; neither its latency nor its failures reveal
   * whether the address belongs to an account.
   * @param email Email address, using the same case-sensitive lookup as login
   * @returns Retry-After in seconds when throttled, or zero for a neutral success
   */
  public async requestPasswordReset(email: string): Promise<number> {
    const address = email.trim();
    const emailHash = crypto.createHash("sha256").update(address.toLowerCase()).digest("hex");
    const result = await this.userRepository.manager.transaction(async(manager) => {
      const limits = manager.getRepository(PasswordResetLimit);
      const now = new Date();
      // Retain at most one day of inactive budgets, including unknown addresses.
      await limits.delete({ windowStartedAt: LessThan(new Date(now.getTime() - 24 * 60 * 60 * 1000)) });
      await limits.createQueryBuilder().insert().values({
        emailHash, windowStartedAt: now, requestCount: 0,
      }).orIgnore().execute();
      const budget = await limits.findOneOrFail({
        where: { emailHash }, lock: { mode: "pessimistic_write" },
      });
      const elapsed = Date.now() - budget.windowStartedAt.getTime();
      if (elapsed >= config.passwordReset.windowMs) {
        budget.windowStartedAt = new Date();
        budget.requestCount = 0;
      } else if (budget.requestCount >= config.passwordReset.maxRequestsPerEmail) {
        return { retryAfter: Math.max(1, Math.ceil((config.passwordReset.windowMs - elapsed) / 1000)) };
      }
      budget.requestCount += 1;
      await limits.save(budget);

      const user = await manager.findOne(User, {
        where: { email: address }, lock: { mode: "pessimistic_write" },
      });
      if (!user?.emailVerifiedAt) {
        return { retryAfter: 0 };
      }
      const token = crypto.randomBytes(32).toString("hex");
      await manager.update(User, user.id, {
        passwordResetTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        passwordResetExpiresAt: new Date(Date.now() + config.passwordReset.expiresInMinutes * 60000),
        passwordResetEmail: user.email,
      });
      return { retryAfter: 0, token, email: user.email };
    });
    if (result.token && result.email) {
      // Not awaited on purpose: waiting for SES only on the verified-account path would make
      // the response measurably slower and let callers enumerate accounts by latency.
      void this.sendPasswordResetEmail(result.email, result.token);
    }
    return result.retryAfter;
  }

  /**
   * Delivers the reset link. Never throws, so it is safe to run detached from the request.
   * @param email Recipient address
   * @param token Raw reset token to embed in the link
   * @returns Promise resolved once delivery has been attempted
   */
  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    try {
      const resetUrl = `${config.baseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
      const messageId = await this.emailService.send({
        to: email,
        from: `${config.sendFrom.name} <${config.sendFrom.email}>`,
        ...renderResetPassword({ resetUrl }),
      });
      if (!messageId) {
        this.logger.error("Password reset email delivery failed");
      }
    } catch {
      this.logger.error("Password reset email delivery failed");
    }
  }

  /**
   * Consumes a reset token, updates the password and revokes sessions in one transaction.
   * @param token Raw token from the reset link
   * @param newPassword Validated new password
   * @returns Whether the token was valid and the password was changed
   */
  public async confirmPasswordReset(token: unknown, newPassword: string): Promise<boolean> {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      return false;
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    return this.userRepository.manager.transaction(async(manager) => {
      const user = await manager.findOne(User, {
        where: { passwordResetTokenHash: tokenHash }, lock: { mode: "pessimistic_write" },
      });
      if (!user || !user.emailVerifiedAt || user.passwordResetEmail !== user.email ||
          !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() <= Date.now()) {
        return false;
      }
      await manager.update(User, user.id, {
        password: this.getPasswordHash(newPassword), modifiedOn: new Date(),
        passwordResetTokenHash: null, passwordResetExpiresAt: null, passwordResetEmail: null,
      });
      await this.revokeAllSessions(user.id, manager);
      return true;
    });
  }

  /**
   * Hashes a password
   * @param password Password to hash
   * @returns Hashed password
   * @throws Error if hashing fails
   */
  public getPasswordHash(password: string): string {
    return bcrypt.hashSync(password);
  }
}
