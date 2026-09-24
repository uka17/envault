import mjml2html from "mjml";

/** Data required to render the "confirm your new email address" email. */
interface ConfirmEmailChangeModel {
  confirmUrl: string;
}

/** Rendered subject line plus HTML and plain-text bodies. */
interface RenderedConfirmEmailChange {
  subject: string;
  html: string;
  text: string;
}

const SUBJECT = "Confirm your new Envault email address";
const PREHEADER = "Confirm your new email address to finish updating your envault.me account.";
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
          You asked to change the email address on your envault.me account. Confirm the new address below.
        </mj-text>
        <mj-button
          background-color="${ACCENT_COLOR}" color="#FFFFFF" font-size="16px" font-weight="600"
          border-radius="6px" href="{{confirmUrl}}" padding="24px 0 8px"
        >
          Confirm new email
        </mj-button>
        <mj-text align="center" font-size="13px" color="#6B6470" padding-top="8px">
          This link expires in 30 minutes. If you did not request this change, ignore this email.
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
  throw new Error(`Failed to compile confirm-email-change email template: ${details}`);
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
 * Renders the "confirm your new email address" notification email sent when a user
 * requests an email change, before the new address becomes active.
 * @param model Confirmation link to interpolate into the email body
 * @returns Subject line plus HTML and plain-text bodies for `EmailService.send`
 */
export function renderConfirmEmailChange(model: ConfirmEmailChangeModel): RenderedConfirmEmailChange {
  const html = interpolate(compiledHtml, {
    confirmUrl: model.confirmUrl,
  });
  const text = [
    "Hi,",
    "",
    "You asked to change the email address on your envault.me account. Confirm the new address below.",
    "",
    `Confirm new email: ${model.confirmUrl}`,
    "",
    "This link expires in 30 minutes. If you did not request this change, ignore this email.",
    "",
    "envault.me",
  ].join("\n");

  return { subject: SUBJECT, html, text };
}
