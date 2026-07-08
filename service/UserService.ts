import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as crypto from "crypto";
import { injectable, inject } from "tsyringe";
import { IsNull, MoreThan, Repository } from "typeorm";

import User from "#model/User.js";
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
   */
  constructor(
    @inject(TOKENS.UserRepository) private userRepository: Repository<User>,
    @inject(TOKENS.SessionRepository) private sessionRepository: Repository<Session>,
    @inject(TOKENS.LogService) private logger: LogService,
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

    const session = await this.sessionRepository.save(
      this.sessionRepository.create({
        user,
        refreshTokenHash: hash,
        expiresAt,
        userAgent: meta?.userAgent ?? null,
        ip: meta?.ip ?? null,
      }),
    );

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
    await this.sessionRepository.save(session);

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
   */
  public async revokeAllSessions(userId: number): Promise<void> {
    await this.sessionRepository.update(
      { user: { id: userId }, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
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
   * Updates the name and/or email of a user.
   * @param userId User ID
   * @param data Object containing optional name and/or email fields to update
   * @returns Updated user without password, or null if user not found
   */
  public async updateProfile(
    userId: number,
    data: { name?: string; email?: string },
  ): Promise<User | null> {
    await this.userRepository.update(userId, { ...data, modifiedOn: new Date() });
    return this.getUserById(userId);
  }

  /**
   * Changes a user's password after verifying the current password.
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
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return false;
    }
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return false;
    }
    await this.userRepository.update(userId, {
      password: this.getPasswordHash(newPassword),
      modifiedOn: new Date(),
    });
    return true;
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
