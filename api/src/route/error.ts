import { Logger } from "../../../lib/Logger";
import Translations from "../../../lib/Translations";
import { Request, Response, NextFunction } from "express";

const createErrorHandler = (logger: Logger, translations: Translations) => {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error(err as object);
    console.log(translations.getText("error_500"));
    return res.status(500).send({ error: translations.getText("error_500") });
  };
};

export { createErrorHandler };
