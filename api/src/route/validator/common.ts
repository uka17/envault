import { validationResult } from "express-validator";
import {
  Request,
  Response,
  NextFunction,
} from "express";

import ApiError from "lib/ApiError";
import { CODES, MESSAGES } from "lib/constants";

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
