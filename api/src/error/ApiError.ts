import { API_ERROR_MESSAGES, type ApiErrorCode } from "#common/errorCodes.js";

export interface ApiFieldError {
  field?: string;
  code: string;
  message: string;
}

export default class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public errors: ApiFieldError[];

  /**
   * @param statusCode HTTP status code to respond with.
   * @param code Stable machine-readable error code.
   * @param message English error message.
   * @param errors Field-level errors, if any (e.g. from request validation).
   */
  constructor(statusCode: number, code: string, message: string, errors: ApiFieldError[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Builds an ApiError from one of the known API error codes, using its registered English message.
   * @param statusCode HTTP status code to respond with.
   * @param code Stable API error code (see `common/errorCodes.ts`).
   * @param errors Field-level errors, if any.
   * @returns A new ApiError instance.
   */
  static fromCode(statusCode: number, code: ApiErrorCode, errors: ApiFieldError[] = []): ApiError {
    return new ApiError(statusCode, code, API_ERROR_MESSAGES[code], errors);
  }
}
