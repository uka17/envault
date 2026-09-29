import { expect } from "chai";
import sinon from "sinon";
import http from "node:http";
import { AddressInfo } from "node:net";

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
    it("should not log raw tokens or message content from transport errors", async() => {
      const secret = "token=private-reset-token";
      const error = Object.assign(new Error(secret), { messageBody: secret });
      sinon.stub((emailService as any).transporter, "sendMail").rejects(error);
      const errorStub = sinon.stub(mockLogger, "error");
      expect(await emailService.send({ to: "test@test.com", text: secret })).to.be.null;
      expect(errorStub.calledOnceWithExactly("Email delivery failed: category=send_failed name=Error")).to.be.true;
      expect(JSON.stringify(errorStub.args)).not.to.include(secret);
    });

    it("should log safe AWS error fields so the cause is visible without the message text", async() => {
      const error = Object.assign(new Error("Rate exceeded for token=private-reset-token"), {
        name: "Throttling", Code: "Throttling", $metadata: { httpStatusCode: 400, requestId: "req-123" },
      });
      sinon.stub((emailService as any).transporter, "sendMail").rejects(error);
      const errorStub = sinon.stub(mockLogger, "error");
      expect(await emailService.sendWithResult({ to: "test@test.com" })).to.deep.equal({ error: "send_failed" });
      expect(errorStub.calledOnceWithExactly(
        "Email delivery failed: category=send_failed name=Throttling code=Throttling httpStatus=400 " +
        "awsRequestId=req-123",
      )).to.be.true;
    });

    it("should drop error fields that could carry arbitrary text", async() => {
      const secret = "private-reset-token";
      const error = { name: `bad name ${secret}`, code: { secret }, $metadata: { requestId: `${secret} link` } };
      sinon.stub((emailService as any).transporter, "sendMail").rejects(error);
      const errorStub = sinon.stub(mockLogger, "error");
      await emailService.sendWithResult({ to: "test@test.com" });
      expect(errorStub.calledOnceWithExactly("Email delivery failed: category=send_failed")).to.be.true;
    });

    for (const error of [{ name: "TimeoutError" }, { code: "ETIMEDOUT" }]) {
      it(`should report ${JSON.stringify(error)} as an ambiguous timeout`, async() => {
        sinon.stub((emailService as any).transporter, "sendMail").rejects(error);
        sinon.stub(mockLogger, "error");
        expect(await emailService.sendWithResult({ to: "test@test.com" })).to.deep.equal({ error: "timeout" });
      });
    }

    it("should treat a response without a message ID as a failed send", async() => {
      sinon.stub((emailService as any).transporter, "sendMail").resolves({});
      const errorStub = sinon.stub(mockLogger, "error");
      expect(await emailService.sendWithResult({ to: "test@test.com" })).to.deep.equal({ error: "send_failed" });
      expect(await emailService.send({ to: "test@test.com" })).to.be.null;
      expect(errorStub.calledWith("Email delivery failed: category=send_failed reason=no_message_id")).to.be.true;
    });

    it("should return null and log error when send fails", async() => {
      sinon.stub((emailService as any).transporter, "sendMail").rejects(new Error("SMTP error"));
      const errorStub = sinon.stub(mockLogger, "error");

      const result = await emailService.send({ to: "test@test.com" });

      expect(result).to.be.null;
      expect(errorStub.calledOnce).to.be.true;
    });
  });

  describe("Timeout", () => {
    let server: http.Server;
    let requests = 0;
    const originalEndpoint = process.env.AWS_ENDPOINT_URL_SES;

    before(async() => {
      // Accepts requests but never answers, like a hanging SES endpoint.
      server = http.createServer(() => {
        requests++;
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      process.env.AWS_ENDPOINT_URL_SES = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    after(async() => {
      if (originalEndpoint === undefined) {
        delete process.env.AWS_ENDPOINT_URL_SES;
      } else {
        process.env.AWS_ENDPOINT_URL_SES = originalEndpoint;
      }
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });

    it("should abort a hanging SES request at the client level and report a timeout", async() => {
      sinon.stub(config.emailTimeout, "requestMs").value(200);
      const errorStub = sinon.stub(mockLogger, "error");
      const service = new EmailService(mockLogger, async() => ({ accessKeyId: "test", secretAccessKey: "test" }));
      const started = Date.now();

      const result = await service.sendWithResult({ to: "test@test.com", from: "test@test.com", text: "body" });

      expect(result).to.deep.equal({ error: "timeout" });
      expect(requests).to.be.at.least(1);
      // The SDK retries a timeout (3 attempts by default), each bounded by requestMs.
      expect(Date.now() - started).to.be.below(5000);
      expect(errorStub.firstCall.args[0]).to.match(/^Email delivery failed: category=timeout name=TimeoutError/);
    }).timeout(10000);
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
        // The caller logs this address, so it must be the one the email actually went to.
        expect(await emailService.sendWithResult({ to: "real-user@example.com" }))
          .to.deep.equal({ messageId: "test-message-id", to: expectedTo });
        expect(warnStub.called).to.equal(environment === "DEV");
      });
    }
  });
});
