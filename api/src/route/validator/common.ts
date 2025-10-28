import { validationResult } from "express-validator";
import {
  Request,
  Response,
  NextFunction,
} from "express";

import ApiError from "api/src/error/ApiError.js";
import { CODES, MESSAGES } from "#common/constants.js";

function validateRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new ApiError(
        CODES.API_REQUEST_VALIDATION_ERROR,
        MESSAGES.API_REQUEST_VALIDATION_ERROR,
        errors.array(),
      ),
    );
  }

  next();
}

export { validateRequest };
