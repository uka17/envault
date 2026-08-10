import mjml2html from "mjml";

/** Data required to render the "verify your email" registration email. */
interface VerifyEmailModel {
  verifyUrl: string;
  code: string;
}

/** Rendered subject line plus HTML and plain-text bodies. */
interface RenderedVerifyEmail {
  subject: string;
  html: string;
  text: string;
}

const SUBJECT = "Verify your email address";
const PREHEADER = "Confirm your email to finish setting up your envault.me account.";
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
          Thanks for signing up for envault.me. Confirm your email address to activate your account.
        </mj-text>
        <mj-button
          background-color="${ACCENT_COLOR}" color="#FFFFFF" font-size="16px" font-weight="600"
          border-radius="6px" href="{{verifyUrl}}" padding="24px 0 8px"
        >
          Verify email
        </mj-button>
        <mj-text align="center" font-size="13px" color="#6B6470" padding-top="8px">
          Or enter this code on the verification page:
        </mj-text>
        <mj-text align="center" font-size="24px" font-weight="700" letter-spacing="4px" color="${INK_COLOR}">
          {{code}}
        </mj-text>
        <mj-text align="center" font-size="13px" color="#6B6470" padding-top="8px">
          This code expires in 30 minutes. If you didn't create an account, you can ignore this email.
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
  throw new Error(`Failed to compile verify-email email template: ${details}`);
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
 * Renders the "verify your email" notification email sent right after a
 * new user registers, before they are allowed to log in.
 * @param model Verification link and code to interpolate into the email body
 * @returns Subject line plus HTML and plain-text bodies for `EmailService.send`
 */
export function renderVerifyEmail(model: VerifyEmailModel): RenderedVerifyEmail {
  const html = interpolate(compiledHtml, {
    verifyUrl: model.verifyUrl,
    code: model.code,
  });
  const text = [
    "Hi,",
    "",
    "Thanks for signing up for envault.me. Confirm your email address to activate your account.",
    "",
    `Verify email: ${model.verifyUrl}`,
    "",
    `Or enter this code on the verification page: ${model.code}`,
    "",
    "This code expires in 30 minutes. If you didn't create an account, you can ignore this email.",
    "",
    "envault.me",
  ].join("\n");

  return { subject: SUBJECT, html, text };
}
