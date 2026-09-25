import mjml2html from "mjml";

/** Data required to render the "reset your password" email. */
interface ResetPasswordModel {
  resetUrl: string;
}

/** Rendered subject line plus HTML and plain-text bodies. */
interface RenderedResetPassword {
  subject: string;
  html: string;
  text: string;
}

const SUBJECT = "Reset your envault.me password";
const PREHEADER = "Choose a new password for your envault.me account.";
const ACCENT_COLOR = "#C47A45";
const INK_COLOR = "#14111D";

const MJML_SOURCE = `<mjml>
  <mj-head>
    <mj-preview>${PREHEADER}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="15px" line-height="24px" color="${INK_COLOR}" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F4F1EC">
    <mj-section padding="32px 24px 16px">
      <mj-column>
        <mj-text align="center" font-size="20px" font-weight="700" color="${INK_COLOR}">envault.me</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" border-radius="8px" padding="32px 24px">
      <mj-column>
        <mj-text>Hi,</mj-text>
        <mj-text>
          We received a request to reset the password for your envault.me account. Choose a new password below.
        </mj-text>
        <mj-button
          background-color="${ACCENT_COLOR}" color="#FFFFFF" font-size="16px" font-weight="600"
          border-radius="6px" href="{{resetUrl}}" padding="24px 0 8px"
        >
          Choose a new password
        </mj-button>
        <mj-text align="center" font-size="13px" line-height="20px" color="#6B6470" padding="8px 25px 2px">
          This link expires in 30 minutes and can only be used once.
        </mj-text>
        <mj-text align="center" font-size="13px" line-height="20px" color="#6B6470" padding="2px 25px">
          This restores access to your account only. Stash encryption keys cannot be recovered.
        </mj-text>
        <mj-text align="center" font-size="13px" line-height="20px" color="#6B6470" padding="2px 25px 10px">
          If you did not request this, you can ignore this email. Your password has not changed.
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="16px 24px 32px">
      <mj-column>
        <mj-text align="center" font-size="12px" color="#9A93A0">envault.me</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

const { html: compiledHtml, errors: compileErrors } = await mjml2html(MJML_SOURCE);

if (compileErrors.length > 0) {
  const details = compileErrors.map((error) => error.formattedMessage).join("; ");
  throw new Error(`Failed to compile reset-password email template: ${details}`);
}

/**
 * Escapes a value for safe use inside an HTML attribute or text node.
 * @param value Raw value
 * @returns HTML-escaped value
 */
function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}

/**
 * Substitutes every occurrence of each `{{token}}` placeholder in a string.
 * @param template String containing `{{token}}` placeholders
 * @param values Map of token name to replacement value
 * @returns String with all placeholders substituted
 */
function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [token, value]) => result.replaceAll(`{{${token}}}`, value),
    template,
  );
}

/**
 * Renders the password reset email without including any stash encryption keys.
 * @param model Absolute reset link containing the one-time token
 * @returns Subject line plus HTML and plain-text bodies for `EmailService.send`
 */
export function renderResetPassword(model: ResetPasswordModel): RenderedResetPassword {
  const html = interpolate(compiledHtml, {
    resetUrl: escapeHtml(model.resetUrl),
  });
  const text = [
    "Hi,",
    "",
    "We received a request to reset the password for your envault.me account. Choose a new password below.",
    "",
    `Choose a new password: ${model.resetUrl}`,
    "",
    "This link expires in 30 minutes and can only be used once.",
    "This restores access to your account only. Stash encryption keys cannot be recovered.",
    "If you did not request this, you can ignore this email. Your password has not changed.",
    "",
    "envault.me",
  ].join("\n");

  return { subject: SUBJECT, html, text };
}
