import { Logger } from "../../../lib/Logger";
import Translations from "../../../lib/Translations";
import { Request, Response, NextFunction } from "express";
import ApiError from "../../../lib/ApiError";

const createErrorHandler = (logger: Logger, translations: Translations) => {
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof ApiError) {
      return res
        .status(error.statusCode)
        .json({ message: error.message, errors: error.errors });
    }
    logger.error(error);
    return res.status(500).send({
      message: translations.getText("error_500"),
    });
  };
};

export { createErrorHandler };
