import LogService from "#service/LogService.js";
import TranslationService from "#service/TranslationService.js";
import { Request, Response, NextFunction } from "express";
import ApiError from "api/src/error/ApiError.js";
import { container } from "tsyringe";
import { TOKENS } from "#di/tokens.js";

export default function(){
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    const logService = container.resolve<LogService>(TOKENS.LogService);
    const translationService = container.resolve<TranslationService>(TOKENS.TranslationService);
    
    if (error instanceof ApiError) {
      return res
        .status(error.statusCode)
        .json({ message: error.message, errors: error.errors });
    }
    logService.error(error);
    return res.status(500).send({
      message: translationService.getText("error_500"),
    });
  };
};

