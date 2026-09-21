import { createHash, randomBytes } from "crypto";
import { inject, injectable } from "tsyringe";
import { IsNull, Repository } from "typeorm";
import User from "#model/User.js";
import EmailVerification from "#model/EmailVerification.js";
import UserService from "#service/UserService.js";
import EmailService from "#service/EmailService.js";
import { TOKENS } from "#di/tokens.js";
import config from "api/src/config/config.js";
import ApiError from "api/src/error/ApiError.js";

@injectable()
export default class EmailChangeService {
  /**
   * Creates the email change service.
   * @param users User repository
   * @param userService Session revocation service
   * @param emailService Email transport
   * @returns Service instance
   */
  constructor(
    @inject(TOKENS.UserRepository) private users: Repository<User>,
    @inject(TOKENS.UserService) private userService: UserService,
    @inject(TOKENS.EmailService) private emailService: EmailService,
  ) {}

  /**
   * Updates a profile or resends its pending email confirmation. Only the hash is persisted.
   * Repeating the same address is a no-op; submitting the current address cancels the request.
   * The per-user send budget survives replacement, cancellation, process restarts and failures.
   * @param userId Authenticated user ID
   * @param data Optional profile changes
   * @param resend Whether to replace the pending token and send another email
   * @returns Profile with the current email unchanged until confirmation
   */
  public async request(
    userId: number,
    data: { name?: string; email?: string } = {},
    resend = false,
  ): Promise<User> {
    const result = await this.users.manager.transaction(async(manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId }, lock: { mode: "pessimistic_write" },
      });
      if (!user) {
        throw ApiError.fromCode(401, "unauthorized");
      }
      const email = resend ? user.pendingEmail : data.email;
      if (resend && !email) {
        throw ApiError.fromCode(409, "email_change_not_pending");
      }
      let token: string | undefined;
      if (email === user.email) {
        user.pendingEmail = null;
        user.emailChangeTokenHash = null;
        user.emailChangeExpiresAt = null;
      } else if (email !== undefined && email !== null && (resend || email !== user.pendingEmail)) {
        const now = new Date();
        const limits = config.emailChange;
        const windowActive = user.emailChangeWindowStartedAt !== null &&
          now.getTime() < user.emailChangeWindowStartedAt.getTime() + limits.windowMs;
        const cooldownUntil = (user.emailChangeLastSentAt?.getTime() ?? 0) + limits.cooldownMs;
        const budgetUntil = windowActive && user.emailChangeSendCount >= limits.maxSends
          ? user.emailChangeWindowStartedAt!.getTime() + limits.windowMs : 0;
        const retryAfter = Math.ceil((Math.max(cooldownUntil, budgetUntil) - now.getTime()) / 1000);
        if (retryAfter > 0) {
          const error = ApiError.fromCode(429, "email_change_rate_limited");
          error.retryAfter = retryAfter;
          throw error;
        }
        if (await manager.existsBy(User, { email })) {
          throw ApiError.fromCode(409, "user_already_exists");
        }
        token = randomBytes(32).toString("hex");
        user.pendingEmail = email;
        user.emailChangeTokenHash = this.hash(token);
        user.emailChangeExpiresAt = new Date(now.getTime() + limits.ttlMs);
        user.emailChangeLastSentAt = now;
        user.emailChangeWindowStartedAt = windowActive ? user.emailChangeWindowStartedAt : now;
        user.emailChangeSendCount = (windowActive ? user.emailChangeSendCount : 0) + 1;
      }
      if (data.name !== undefined) {
        user.name = data.name;
      }
      await manager.save(user);
      return { user, token };
    });

    // Commit before contacting SES. A failure leaves the old login working and allows resend.
    if (result.token) {
      const url = `${config.baseUrl}/confirm-email-change?token=${result.token}`;
      let messageId: string | null;
      try {
        messageId = await this.emailService.send({
          to: result.user.pendingEmail!,
          from: `${config.sendFrom.name} <${config.sendFrom.email}>`,
          subject: "Confirm your new Envault email address",
          text: `Confirm your new email address: ${url}\nThis link expires in 30 minutes. ` +
            "If you did not request this change, ignore this email.",
        });
      } catch {
        throw ApiError.fromCode(503, "email_change_delivery_failed");
      }
      if (!messageId) {
        throw ApiError.fromCode(503, "email_change_delivery_failed");
      }
    }
    return result.user;
  }

  /**
   * Atomically consumes the token, replaces the address and revokes every existing session.
   * The unique email index is the final arbiter when another account takes the same address.
   * @param token Raw token received by email (not an authenticated user's ID)
   * @returns Nothing on success
   */
  public async confirm(token: string): Promise<void> {
    try {
      await this.users.manager.transaction(async(manager) => {
        const user = await manager.findOne(User, {
          where: { emailChangeTokenHash: this.hash(token) }, lock: { mode: "pessimistic_write" },
        });
        if (!user?.pendingEmail || !user.emailChangeExpiresAt || user.emailChangeExpiresAt <= new Date()) {
          throw ApiError.fromCode(401, "email_change_token_invalid");
        }
        user.email = user.pendingEmail;
        user.emailVerifiedAt = new Date();
        user.pendingEmail = null;
        user.emailChangeTokenHash = null;
        user.emailChangeExpiresAt = null;
        await manager.save(user);
        await manager.update(EmailVerification,
          { user: { id: user.id }, consumedAt: IsNull() }, { consumedAt: new Date() });
        await this.userService.revokeAllSessions(user.id, manager);
      });
    } catch (error) {
      if ((error as { driverError?: { code?: string; constraint?: string } }).driverError?.code === "23505") {
        throw ApiError.fromCode(409, "user_already_exists");
      }
      throw error;
    }
  }

  /**
   * Hashes the high-entropy email change token.
   * @param token Raw token
   * @returns SHA-256 hex digest
   */
  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
