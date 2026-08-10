import request from "supertest";
import sinon from "sinon";
import { container } from "tsyringe";
import { TOKENS } from "#di/tokens.js";
import EmailService from "#service/EmailService.js";

/**
 * Registers a user through the public registration endpoint and immediately verifies
 * their email, by stubbing `EmailService.send` for the duration of the call to capture
 * the verification code from the outgoing email body and submitting it to the
 * verify-email endpoint. Needed because login is blocked for unverified accounts.
 * @param credentials Registration payload (email, password, name)
 * @returns The registration response
 */
export async function registerAndVerifyUser(
  credentials: { email: string; password: string; name: string },
) {
  const emailService = container.resolve<EmailService>(TOKENS.EmailService);
  let capturedText: string | undefined;
  const sendStub = sinon.stub(emailService, "send").callsFake(async(mailOptions) => {
    capturedText = mailOptions.text?.toString();
    return "test-message-id";
  });

  const createResponse = await request(globalThis.app).post("/api/v1/users").send(credentials);
  const code = capturedText?.match(/verification page: (\S+)/)?.[1];
  await request(globalThis.app).post("/api/v1/users/verify-email").send({ code });

  sendStub.restore();
  return createResponse;
}
