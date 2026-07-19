import { validationResult } from "express-validator";
import {
  Request,
  Response,
  NextFunction,
} from "express";

import ApiError, { ApiFieldError } from "api/src/error/ApiError.js";
import { CODES, MESSAGES } from "#common/constants.js";

/**
 * Runs express-validator's collected validation errors (populated via each
 * rule's `.withMessage(apiErrorPayload(code))`) and, if any failed, passes a
 * unified ApiError with one field error per failed rule to the error handler.
 * @param req Request object
 * @param res Response object
 * @param next Next function
 */
function validateRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const validationErrors = validationResult(req);
  if (!validationErrors.isEmpty()) {
    const fieldErrors: ApiFieldError[] = validationErrors.array().map((validationError) => {
      const { code, message } = validationError.msg as { code: string; message: string };
      return {
        field: validationError.type === "field" ? validationError.path : undefined,
        code,
        message,
      };
    });

    return next(
      new ApiError(
        CODES.API_REQUEST_VALIDATION_ERROR,
        "validation_error",
        MESSAGES.API_REQUEST_VALIDATION_ERROR,
        fieldErrors,
      ),
    );
  }

  next();
}

export { validateRequest };
