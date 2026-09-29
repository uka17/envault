import request from "supertest";
import sinon from "sinon";
import { container } from "tsyringe";
import { TOKENS } from "#di/tokens.js";
import EmailService from "#service/EmailService.js";
import config from "api/src/config/config.js";

/**
 * Builds rate limit budgets which never trigger, for apps whose tests are not about rate limits
 * but share one client IP and reuse accounts.
 * @returns Copy of `config.rateLimits` with unlimited budgets
 */
export function unlimitedRateLimits(): typeof config.rateLimits {
  return Object.fromEntries(Object.entries(config.rateLimits)
    .map(([name, limit]) => [name, { ...limit, max: Number.MAX_SAFE_INTEGER }])) as typeof config.rateLimits;
}

/**
 * Registers a user through the public registration endpoint and immediately verifies
 * their email, by stubbing `EmailService.send` for the duration of the call to capture
 * the verification code from the outgoing email body and submitting it to the
 * verify-email endpoint. Needed because login is blocked for unverified accounts.
 * @param credentials Registration payload (email, password, name)
 * @param app App to call, the shared test app by default
 * @returns The registration response
 */
export async function registerAndVerifyUser(
  credentials: { email: string; password: string; name: string },
  app = globalThis.app,
) {
  const emailService = container.resolve<EmailService>(TOKENS.EmailService);
  let capturedText: string | undefined;
  const sendStub = sinon.stub(emailService, "send").callsFake(async(mailOptions) => {
    capturedText = mailOptions.text?.toString();
    return "test-message-id";
  });

  const createResponse = await request(app).post("/api/v1/users").send(credentials);
  const code = capturedText?.match(/verification page: (\S+)/)?.[1];
  await request(app).post("/api/v1/users/verify-email").send({ code });

  sendStub.restore();
  return createResponse;
}
