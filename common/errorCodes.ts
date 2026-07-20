/**
 * Stable, machine-readable API error codes and their English messages.
 * The frontend owns all localization; these codes let it map each error to
 * its own translated text, with the English `message` here used only as a
 * fallback for codes it doesn't recognize yet.
 */
const API_ERROR_MESSAGES = {
  is_required: "This field is required",
  should_be_alphanumeric: "Should contain only letters and numerals",
  email_format_incorrect: "Has incorrect email format",
  date_format_incorrect: "Has incorrect date format",
  should_be_numeric: "Should be numeric",
  should_be_string: "Should be a string",
  password_format_incorrect:
    "Password should have minimum eight characters, at least one capital letter and one number",
  user_already_exists: "Email is invalid or already taken",
  user_not_found: "User not found",
  stash_not_found: "Stash not found",
  stash_unlock_failed: "Invalid link or key",
  session_not_found: "Session not found",
  incorrect_token: "Token is incorrect",
  incorrect_password_or_email: "Password or email is incorrect",
  error_500: "Oops, something went wrong and the server returned an error",
  unauthorized: "Unauthorized",
  body_required: "body parameter is required",
  incorrect_current_password: "Current password is incorrect",
  email_required: "Email is required",
  name_required: "Name is required",
  password_required: "Password is required",
  name_alphanumeric:
    "Name should contain only letters, with single spaces, hyphens or apostrophes between words (e.g. \"John Doe\")",
  current_password_required: "Current password is required",
  new_password_required: "New password is required",
  id_required: "ID is required",
} as const;

type ApiErrorCode = keyof typeof API_ERROR_MESSAGES;

/**
 * Builds a `{code, message}` payload for the given API error code, using its
 * registered English text. Intended for use with express-validator's
 * `.withMessage()`, which stores whatever value it's given as-is.
 * @param code Stable API error code (see `API_ERROR_MESSAGES`).
 * @returns Object with `code` and its English `message`.
 */
function apiErrorPayload(code: ApiErrorCode): { code: ApiErrorCode; message: string } {
  return { code, message: API_ERROR_MESSAGES[code] };
}

export { API_ERROR_MESSAGES, apiErrorPayload };
export type { ApiErrorCode };
