import mjml2html from "mjml";

/** Data required to render the "stash ready to unlock" notification email. */
interface StashReadyEmailModel {
  senderName: string;
  unlockUrl: string;
  faqUrl: string;
}

/** Rendered subject line plus HTML and plain-text bodies. */
interface RenderedStashReadyEmail {
  subject: string;
  html: string;
  text: string;
}

const SUBJECT_TEMPLATE = "A message from {{senderName}} is ready for you";
const PREHEADER = "Your decryption key is required to open it.";
const ACCENT_COLOR = "#C47A45";
const INK_COLOR = "#14111D";

const senderNamePlaceholder = `<span style="color:${ACCENT_COLOR};">{{senderName}}</span>`;

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
          ${senderNamePlaceholder} scheduled an encrypted message for you on envault.me.
          The time has come, it's ready to open.
        </mj-text>
        <mj-text>
          To read it, you'll need the decryption key ${senderNamePlaceholder} was supposed to
          share with you separately. Without it, the message can't be decrypted, not even by us.
        </mj-text>
        <mj-button
          background-color="${ACCENT_COLOR}" color="#FFFFFF" font-size="16px" font-weight="600"
          border-radius="6px" href="{{unlockUrl}}" padding="24px 0 8px"
        >
          Open your message
        </mj-button>
        <mj-text align="center" font-size="13px" color="#6B6470" padding-top="8px">
          Have questions about how this works? Check our <a href="{{faqUrl}}" style="color:${ACCENT_COLOR};">FAQ</a>.
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
  throw new Error(`Failed to compile stash-ready email template: ${details}`);
}

/**
 * Escapes HTML-significant characters so user-controlled text (e.g. a
 * sender's display name) cannot inject markup into the rendered email.
 * @param value Raw text that may contain HTML-significant characters
 * @returns Text safe to interpolate into HTML markup
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
 * Renders the "stash ready to unlock" notification email sent to a stash's
 * recipient once its scheduled delivery time has arrived.
 * @param model Sender name and links to interpolate into the email body
 * @returns Subject line plus HTML and plain-text bodies for `EmailService.send`
 */
export function renderStashReadyEmail(model: StashReadyEmailModel): RenderedStashReadyEmail {
  // Strip line breaks so a display name can't be used to inject extra
  // headers into the email via the subject line.
  const senderName = model.senderName.replace(/[\r\n]+/g, " ").trim();
  const safeSenderName = escapeHtml(senderName);

  const subject = interpolate(SUBJECT_TEMPLATE, { senderName });
  const html = interpolate(compiledHtml, {
    senderName: safeSenderName,
    unlockUrl: model.unlockUrl,
    faqUrl: model.faqUrl,
  });
  const text = [
    "Hi,",
    "",
    `${senderName} scheduled an encrypted message for you on envault.me. The time has come, it's ready to open.`,
    "",
    `To read it, you'll need the decryption key ${senderName} was supposed to share with you ` +
      "separately. Without it, the message can't be decrypted, not even by us.",
    "",
    `Open your message: ${model.unlockUrl}`,
    "",
    `Have questions about how this works? Check our FAQ: ${model.faqUrl}`,
    "",
    "envault.me",
  ].join("\n");

  return { subject, html, text };
}
