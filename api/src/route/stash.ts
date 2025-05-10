import express from "express";
import passport from "passport";
import dotenv from "dotenv";
import { container } from "tsyringe";

import { TOKENS } from "di/tokens";
import { validateRequest } from "./validator/common";

import StashController from "api/src/controller/StashController";
import StashValidator from "api/src/route/validator/StashValidator";

dotenv.config();

export default function (app: express.Router) {
  const stashController =
    container.resolve<StashController>(
      TOKENS.StashController,
    );
  const stashValidator =
    container.resolve<StashValidator>(
      TOKENS.StashValidator,
    );
  const validationRules =
    stashValidator.getRules();

  app.post(
    `/api/v1/stashes`,
    passport.authenticate("jwt", {
      session: false,
    }),
    validationRules.create,
    validateRequest,
    stashController.create.bind(stashController),
  );

  app.get(
    `/api/v1/stashes`,
    passport.authenticate("jwt", {
      session: false,
    }),
    stashController.list.bind(stashController),
  );

  app.get(
    `/api/v1/stashes/:id`,
    passport.authenticate("jwt", {
      session: false,
    }),
    validationRules.find,
    validateRequest,
    stashController.get.bind(stashController),
  );

  app.delete(
    `/api/v1/stashes/:id`,
    passport.authenticate("jwt", {
      session: false,
    }),
    validationRules.delete,
    validateRequest,
    stashController.delete.bind(stashController),
  );

  app.post(
    `/api/v1/stashes/:id/snooze/:hours`,
    passport.authenticate("jwt", {
      session: false,
    }),
    validationRules.snooze,
    validateRequest,
    stashController.snooze.bind(stashController),

    //TODO
    //1. Connect user entity in responses
    //
  );
}
