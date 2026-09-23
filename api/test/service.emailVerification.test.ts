import { expect } from "chai";
import sinon from "sinon";
import { customAlphabet } from "nanoid";

import EmailVerificationService from "#service/EmailVerificationService.js";
import UserService from "#service/UserService.js";
import EmailService from "#service/EmailService.js";
import User from "#model/User.js";
import Session from "#model/Session.js";
import EmailVerification from "#model/EmailVerification.js";
import config from "api/src/config/config.js";

const userId = customAlphabet("1234567890abcdef", 10);

const userRepository = globalThis.appDataSource.getRepository(User);
const sessionRepository = globalThis.appDataSource.getRepository(Session);
const emailVerificationRepository = globalThis.appDataSource.getRepository(EmailVerification);

let emailVerificationService: EmailVerificationService;
let userService: UserService;
let emailService: EmailService;
let sendStub: sinon.SinonStub;

/**
 * Creates and persists a fresh unverified user for a test.
 * @returns The persisted user
 */
async function createUnverifiedUser(): Promise<User> {
  const user = new User();
  user.email = `${userId()}@test.com`;
  user.password = "hashed";
  user.name = "Verification Test User";
  user.emailVerifiedAt = null;
  return userRepository.save(user);
}

describe("EmailVerification service", () => {
  beforeEach(() => {
    emailService = new EmailService(globalThis.mockLogService, null);
    userService = new UserService(userRepository, sessionRepository, globalThis.mockLogService, emailService);
    emailVerificationService = new EmailVerificationService(
      emailVerificationRepository,
      emailService,
      userService,
      globalThis.mockLogService,
    );
    sendStub = sinon.stub(emailService, "send").resolves("test-message-id");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("generateCode", () => {
    it("should generate a code of the configured length using the configured alphabet", () => {
      const code = emailVerificationService.generateCode();

      expect(code).to.have.length(config.emailVerification.codeLength);
      expect(code).to.match(new RegExp(`^[${config.emailVerification.codeAlphabet}]+$`));
    });

    it("should generate different codes on subsequent calls", () => {
      const first = emailVerificationService.generateCode();
      const second = emailVerificationService.generateCode();

      expect(first).to.not.equal(second);
    });
  });

  describe("createAndSend", () => {
    it("should send an email with a link and code, and persist a hashed, unexpired row", async() => {
      const user = await createUnverifiedUser();

      await emailVerificationService.createAndSend(user);

      expect(sendStub.calledOnce).to.be.true;
      const mailOptions = sendStub.firstCall.args[0];
      expect(mailOptions.to).to.equal(user.email);
      expect(mailOptions.html).to.include(config.baseUrl);

      const rows = await emailVerificationRepository.find({ where: { user: { id: user.id } } });
      expect(rows).to.have.length(1);
      expect(rows[0].consumedAt).to.be.null;
      expect(rows[0].expiresAt.getTime()).to.be.greaterThan(Date.now());
    });

    it("should invalidate a previously active code when called again", async() => {
      const user = await createUnverifiedUser();

      await emailVerificationService.createAndSend(user);
      const [firstRow] = await emailVerificationRepository.find({ where: { user: { id: user.id } } });

      await emailVerificationService.createAndSend(user);

      const refreshedFirstRow = await emailVerificationRepository.findOneBy({ id: firstRow.id });
      expect(refreshedFirstRow?.consumedAt).to.not.be.null;

      const activeRows = (
        await emailVerificationRepository.find({ where: { user: { id: user.id } } })
      ).filter((row) => row.consumedAt === null);
      expect(activeRows).to.have.length(1);
    });

    it("should not throw when the email fails to send, but still persist the code", async() => {
      sendStub.resolves(null);
      const loggerStub = { error: sinon.stub() };
      (emailVerificationService as any).logger = loggerStub;
      const user = await createUnverifiedUser();

      await emailVerificationService.createAndSend(user);

      expect(loggerStub.error.calledOnce).to.be.true;
      const rows = await emailVerificationRepository.find({ where: { user: { id: user.id } } });
      expect(rows).to.have.length(1);
      expect(rows[0].consumedAt).to.be.null;
    });
  });

  describe("verify", () => {
    it("should return null for an unknown code", async() => {
      const result = await emailVerificationService.verify("unknown-code");
      expect(result).to.be.null;
    });

    it("should mark the user as verified and consume the code for a valid code", async() => {
      const user = await createUnverifiedUser();
      const codeStub = sinon.stub(emailVerificationService, "generateCode").returns("fixed-code-1");

      await emailVerificationService.createAndSend(user);
      codeStub.restore();

      const result = await emailVerificationService.verify("fixed-code-1");

      expect(result?.id).to.equal(user.id);
      expect(result?.emailVerifiedAt).to.not.be.null;

      const persisted = await userRepository.findOneBy({ id: user.id });
      expect(persisted?.emailVerifiedAt).to.not.be.null;
    });

    it("should return null when the same code is verified twice", async() => {
      const user = await createUnverifiedUser();
      const codeStub = sinon.stub(emailVerificationService, "generateCode").returns("fixed-code-2");

      await emailVerificationService.createAndSend(user);
      codeStub.restore();

      const first = await emailVerificationService.verify("fixed-code-2");
      const second = await emailVerificationService.verify("fixed-code-2");

      expect(first).to.not.be.null;
      expect(second).to.be.null;
    });

    it("should return null for an expired code", async() => {
      const user = await createUnverifiedUser();
      const codeStub = sinon.stub(emailVerificationService, "generateCode").returns("fixed-code-3");
      await emailVerificationService.createAndSend(user);
      codeStub.restore();

      const [row] = await emailVerificationRepository.find({ where: { user: { id: user.id } } });
      row.expiresAt = new Date(Date.now() - 1000);
      await emailVerificationRepository.save(row);

      const result = await emailVerificationService.verify("fixed-code-3");
      expect(result).to.be.null;
    });
  });

  describe("resend", () => {
    it("should do nothing for an unknown email", async() => {
      await emailVerificationService.resend(`${userId()}@test.com`);
      expect(sendStub.called).to.be.false;
    });

    it("should do nothing for an already-verified email", async() => {
      const user = await createUnverifiedUser();
      user.emailVerifiedAt = new Date();
      await userRepository.save(user);

      await emailVerificationService.resend(user.email);
      expect(sendStub.called).to.be.false;
    });

    it("should send a new code for an unverified, existing email", async() => {
      const user = await createUnverifiedUser();

      await emailVerificationService.resend(user.email);

      expect(sendStub.calledOnce).to.be.true;
      const rows = await emailVerificationRepository.find({ where: { user: { id: user.id } } });
      expect(rows.some((row) => row.consumedAt === null)).to.be.true;
    });
  });
});
