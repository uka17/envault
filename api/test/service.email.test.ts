import { expect } from "chai";
import sinon from "sinon";

import EmailService from "#service/EmailService.js";
import LogService from "#service/LogService.js";
import config from "api/src/config/config.js";

const TEST_RECIPIENT = "ukaoneseven@gmail.com";
const mockLogger = new LogService();
const emailService = new EmailService(mockLogger, null);

describe("Email service", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("Configuration", () => {
    it("should create SES client with the region from config", async() => {
      expect(await (emailService as any).sesClient.config.region()).to.equal(config.awsRegion);
    });
  });

  describe("Errors", () => {
    it("should return null and log error when send fails", async() => {
      sinon.stub((emailService as any).transporter, "sendMail").rejects(new Error("SMTP error"));
      const errorStub = sinon.stub(mockLogger, "error");

      const result = await emailService.send({ to: "test@test.com" });

      expect(result).to.be.null;
      expect(errorStub.calledOnce).to.be.true;
    });
  });

  describe("Regular logic", () => {
    it("should send email", async() => {
      const loggerStub = sinon.stub(mockLogger, "info");
      const fakeMessageId = "<test-message-id>";
      const sendStub = sinon.stub((emailService as any).transporter, "sendMail").resolves({
        messageId: fakeMessageId,
      });
      const mailOptions = {
        to: "test@test.com",
        from: "test@test.com",
        subject: "New stash",
        html: "<h1>New stash</h1>",
        text: "New stash",
      };

      const result = await emailService.send(mailOptions);
      expect(result).to.equal(fakeMessageId);
      expect(loggerStub.calledOnce).to.be.true;
      expect(sendStub.calledOnce).to.be.true;
    });
  });

  describe("DEV recipient redirect", () => {
    const originalEnv = process.env.ENV;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.ENV;
      } else {
        process.env.ENV = originalEnv;
      }
    });

    for (const environment of ["PROD", "DEV", "dev", "development", " DEV ", "", undefined]) {
      it(`redirects to the test recipient only for ENV=${JSON.stringify(environment)}`, async() => {
        if (environment === undefined) {
          delete process.env.ENV;
        } else {
          process.env.ENV = environment;
        }
        const sendStub = sinon.stub((emailService as any).transporter, "sendMail").resolves({
          messageId: "test-message-id",
        });
        const warnStub = sinon.stub(mockLogger, "warn");

        await emailService.send({ to: "real-user@example.com" });

        const expectedTo = environment === "DEV" ? TEST_RECIPIENT : "real-user@example.com";
        expect(sendStub.firstCall.args[0].to).to.equal(expectedTo);
        expect(warnStub.called).to.equal(environment === "DEV");
      });
    }
  });
});
