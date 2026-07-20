import LogService from "#service/LogService.js";
import { Request, Response, NextFunction } from "express";
import ApiError from "api/src/error/ApiError.js";
import { container } from "tsyringe";
import { TOKENS } from "#di/tokens.js";
import { CODES } from "#common/constants.js";
import { API_ERROR_MESSAGES } from "#common/errorCodes.js";

export default function(){
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    const logService = container.resolve<LogService>(TOKENS.LogService);

    if (error instanceof ApiError) {
      return res
        .status(error.statusCode)
        .json({ code: error.code, message: error.message, errors: error.errors });
    }
    logService.error(error);
    return res.status(CODES.SERVER_ERROR).json({
      code: "error_500",
      message: API_ERROR_MESSAGES.error_500,
    });
  };
};
