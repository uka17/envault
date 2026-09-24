import * as crypto from "crypto";
import { customAlphabet } from "nanoid";
import { injectable, inject } from "tsyringe";
import { IsNull, MoreThan, Repository } from "typeorm";

import User from "#model/User.js";
import EmailVerification from "#model/EmailVerification.js";
import EmailService from "#service/EmailService.js";
import UserService from "#service/UserService.js";
import LogService from "#service/LogService.js";
import config from "api/src/config/config.js";
import { TOKENS } from "#di/tokens.js";
import { renderVerifyEmail } from "#common/templates/verifyEmail.js";

@injectable()
export default class EmailVerificationService {
  /**
   * Creates instance of `EmailVerificationService`
   * @param emailVerificationRepository EmailVerification repository
   * @param emailService Email service, used to actually deliver the verification email
   * @param userService User service, used to look up users by email for the resend flow
   * @param logger Logger service
   */
  constructor(
    @inject(TOKENS.EmailVerificationRepository)
    private emailVerificationRepository: Repository<EmailVerification>,
    @inject(TOKENS.EmailService) private emailService: EmailService,
    @inject(TOKENS.UserService) private userService: UserService,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Generates a random human-typeable verification code
   * @returns Random verification code
   */
  public generateCode(): string {
    const nanoid = customAlphabet(
      config.emailVerification.codeAlphabet,
      config.emailVerification.codeLength,
    );
    return nanoid();
  }

  /**
   * Invalidates any still-active verification codes for the user, generates a new one,
   * stores its hash and sends it to the user by email (as both a link and a plain code).
   * A delivery failure is logged but does not throw, so it never rolls back or fails the
   * caller's own operation (e.g. registration); the user can always request a resend.
   * @param user User to send the verification email to
   * @returns Nothing
   */
  public async createAndSend(user: User): Promise<void> {
    await this.emailVerificationRepository.update(
      { user: { id: user.id }, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    const code = this.generateCode();
    const codeHash = this.hash(code);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + config.emailVerification.expiresInMinutes);

    await this.emailVerificationRepository.save(
      this.emailVerificationRepository.create({ user, codeHash, expiresAt, consumedAt: null }),
    );

    const verifyUrl = `${config.baseUrl}/verify-email?code=${code}`;
    const { subject, html, text } = renderVerifyEmail({ verifyUrl, code });

    const messageId = await this.emailService.send({
      to: user.email,
      from: `${config.sendFrom.name} <${config.sendFrom.email}>`,
      subject,
      html,
      text,
    });

    if (!messageId) {
      this.logger.error(`Failed to send verification email to user ${user.id}`);
    }
  }

  /**
   * Resends a verification email for the given address, if it belongs to an existing,
   * not-yet-verified user. Never reveals whether the address is registered or already
   * verified, so callers should always report success to the client regardless.
   * @param email Email address to resend the verification code to
   * @returns Nothing
   */
  public async resend(email: string): Promise<void> {
    const user = await this.userService.getUserByEmail(email);
    if (!user || user.emailVerifiedAt) {
      return;
    }
    await this.createAndSend(user);
  }

  /**
   * Verifies a raw code and, if valid, marks the owning user's email as verified.
   * @param code Raw verification code submitted by the user
   * @returns The verified user, or `null` if the code is invalid, expired or already used
   */
  public async verify(code: string): Promise<User | null> {
    const codeHash = this.hash(code);

    const verification = await this.emailVerificationRepository.findOne({
      where: { codeHash, consumedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      relations: { user: true },
    });

    if (!verification) {
      return null;
    }

    return this.emailVerificationRepository.manager.transaction(async(manager) => {
      const user = await manager.findOne(User, {
        where: { id: verification.user.id }, lock: { mode: "pessimistic_write" },
      });
      if (!user) {
        return null;
      }
      const claim = await manager.update(EmailVerification, {
        id: verification.id, consumedAt: IsNull(), expiresAt: MoreThan(new Date()),
      }, { consumedAt: new Date() });
      if (claim.affected !== 1) {
        return null;
      }
      // Never save the stale user snapshot read before the lock (it may contain an old email).
      user.emailVerifiedAt = new Date();
      await manager.update(User, user.id, { emailVerifiedAt: user.emailVerifiedAt });
      return user;
    });
  }

  /**
   * Hashes a raw verification code for storage/lookup, mirroring how refresh tokens are hashed.
   * @param code Raw verification code
   * @returns SHA-256 hex digest of the code
   */
  private hash(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }
}
