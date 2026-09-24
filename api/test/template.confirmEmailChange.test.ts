import { expect } from "chai";

import { renderConfirmEmailChange } from "#common/templates/confirmEmailChange.js";

describe("confirmEmailChange email template", () => {
  const baseModel = {
    confirmUrl: "https://envault.me/confirm-email-change?token=abc12345",
  };

  it("should have a fixed, descriptive subject", () => {
    const { subject } = renderConfirmEmailChange(baseModel);

    expect(subject).to.equal("Confirm your new Envault email address");
  });

  it("should interpolate the confirmation link into the HTML body", () => {
    const { html } = renderConfirmEmailChange(baseModel);

    expect(html).to.include(`href="${baseModel.confirmUrl}"`);
  });

  it("should interpolate the confirmation link into the plain-text body", () => {
    const { text } = renderConfirmEmailChange(baseModel);

    expect(text).to.include(baseModel.confirmUrl);
  });
});
