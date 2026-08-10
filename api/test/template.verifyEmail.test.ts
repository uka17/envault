import { expect } from "chai";

import { renderVerifyEmail } from "#common/templates/verifyEmail.js";

describe("verifyEmail email template", () => {
  const baseModel = {
    verifyUrl: "https://envault.me/verify-email?code=abc12345",
    code: "abc12345",
  };

  it("should have a fixed, descriptive subject", () => {
    const { subject } = renderVerifyEmail(baseModel);

    expect(subject).to.equal("Verify your email address");
  });

  it("should interpolate the verify link and code into the HTML body", () => {
    const { html } = renderVerifyEmail(baseModel);

    expect(html).to.include(`href="${baseModel.verifyUrl}"`);
    expect(html).to.include(baseModel.code);
  });

  it("should interpolate the verify link and code into the plain-text body", () => {
    const { text } = renderVerifyEmail(baseModel);

    expect(text).to.include(baseModel.verifyUrl);
    expect(text).to.include(baseModel.code);
  });
});
