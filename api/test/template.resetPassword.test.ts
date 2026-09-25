import { expect } from "chai";
import { renderResetPassword } from "#common/templates/resetPassword.js";

describe("Password reset email", () => {
  it("includes the link, expiry, ignore instructions and encryption-key limitation", () => {
    const url = "https://envault.example/reset-password?token=abc";
    const rendered = renderResetPassword({ resetUrl: url });
    expect(rendered.subject).to.equal("Reset your envault.me password");
    for (const body of [rendered.html, rendered.text]) {
      expect(body).to.include(url);
      expect(body).to.include("30 minutes");
      expect(body).to.include("only be used once");
      expect(body).to.include("encryption keys cannot be recovered");
      expect(body).to.include("ignore this email");
    }
  });

  it("renders the link as the call-to-action button with a preheader", () => {
    const url = "https://envault.example/reset-password?token=abc";
    const { html } = renderResetPassword({ resetUrl: url });
    expect(html).to.include(`href="${url}"`);
    expect(html).to.include("Choose a new password for your envault.me account.");
    expect(html).not.to.include("{{resetUrl}}");
  });

  it("escapes HTML in links while preserving the plain-text URL", () => {
    const url = "https://example.com/?token=abc&x=\"<test>'";
    const rendered = renderResetPassword({ resetUrl: url });
    expect(rendered.html).to.include("&amp;x=&quot;&lt;test&gt;&#39;");
    expect(rendered.html).not.to.include("<test>");
    expect(rendered.text).to.include(url);
  });
});
