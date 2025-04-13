import { validationResult } from "express-validator";
import ApiError from "../../../../lib/ApiError";
import { CODES, MESSAGES } from "../../../../lib/constants";
import { Request } from "express";

function validateRequest(req: Request): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(
      CODES.API_REQUEST_VALIDATION_ERROR,
      MESSAGES.API_REQUEST_VALIDATION_ERROR,
      errors.array()
    );
  }
}

export { validateRequest };
