import LogService from "service/LogService";
import TranslationService from "service/TranslationService";
import { Request, Response, NextFunction } from "express";
import ApiError from "api/src/error/ApiError";

const createErrorHandler = (
  logger: LogService,
  translationService: TranslationService,
) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof ApiError) {
      return res
        .status(error.statusCode)
        .json({ message: error.message, errors: error.errors });
    }
    logger.error(error);
    return res.status(500).send({
      message: translationService.getText("error_500"),
    });
  };
};

export default createErrorHandler;
