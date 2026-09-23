/**
 * Renders the password reset email without including any stash encryption keys.
 * @param resetUrl Absolute reset link containing the one-time token
 * @returns Subject and HTML/plain-text message bodies
 */
export function renderResetPassword(resetUrl: string): { subject: string; html: string; text: string } {
  const escapedUrl = resetUrl.replaceAll("&", "&amp;").replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
  const subject = "Reset your envault.me password";
  const explanation = "This link expires in 30 minutes and can only be used once.";
  const disclaimer = "This restores access to your account only. Stash encryption keys cannot be recovered.";
  const ignore = "If you did not request this, you can ignore this email. Your password has not changed.";
  return {
    subject,
    html: `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#14111D">
      <h1>envault.me</h1><h2>Reset your password</h2>
      <p><a href="${escapedUrl}" style="color:#C47A45">Choose a new password</a></p>
      <p>${explanation}</p><p>${disclaimer}</p><p>${ignore}</p></body></html>`,
    text: `${subject}\n\nChoose a new password: ${resetUrl}\n\n${explanation}\n${disclaimer}\n${ignore}`,
  };
}
