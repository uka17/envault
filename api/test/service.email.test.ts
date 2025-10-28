import { expect } from "chai";
import sinon from "sinon";

import EmailService from "#service/EmailService.js";
import LogService from "#service/LogService.js";

const mockLogger = new LogService();
const emailService = new EmailService(mockLogger, null);

describe("Email service", () => {
  afterEach(() => {
    sinon.restore();
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
});
