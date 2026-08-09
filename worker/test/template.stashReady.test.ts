import { expect } from "chai";

import { renderStashReadyEmail } from "worker/src/templates/stashReady.js";

describe("stashReady email template", () => {
  const baseModel = {
    senderName: "Jordan Smith",
    unlockUrl: "https://envault.me/unlock/token1234",
    faqUrl: "https://envault.me/faq",
  };

  it("should interpolate the sender name into the subject", () => {
    const { subject } = renderStashReadyEmail(baseModel);

    expect(subject).to.equal("A message from Jordan Smith is ready for you");
  });

  it("should interpolate the sender name, unlock link and FAQ link into the HTML body", () => {
    const { html } = renderStashReadyEmail(baseModel);

    expect(html).to.include("Jordan Smith");
    expect(html).to.include(`href="${baseModel.unlockUrl}"`);
    expect(html).to.include(`href="${baseModel.faqUrl}"`);
  });

  it("should interpolate the sender name and unlock link into the plain-text body", () => {
    const { text } = renderStashReadyEmail(baseModel);

    expect(text).to.include("Jordan Smith");
    expect(text).to.include(baseModel.unlockUrl);
    expect(text).to.include(baseModel.faqUrl);
  });

  it("should HTML-escape a sender name containing markup", () => {
    const { html } = renderStashReadyEmail({
      ...baseModel,
      senderName: "<script>alert(1)</script>",
    });

    expect(html).to.not.include("<script>alert(1)</script>");
    expect(html).to.include("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("should not HTML-escape the sender name in the plain-text body", () => {
    const { text } = renderStashReadyEmail({
      ...baseModel,
      senderName: "Jordan & Smith",
    });

    expect(text).to.include("Jordan & Smith");
  });

  it("should strip line breaks from the sender name to prevent header injection via the subject", () => {
    const { subject } = renderStashReadyEmail({
      ...baseModel,
      senderName: "Jordan\r\nBcc: attacker@example.com",
    });

    expect(subject).to.not.include("\r");
    expect(subject).to.not.include("\n");
    expect(subject).to.equal("A message from Jordan Bcc: attacker@example.com is ready for you");
  });
});
