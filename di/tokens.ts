import TranslationService from "service/TranslationService";

export const TOKENS = {
  StashRepository: Symbol("StashRepository"),
  UserRepository: Symbol("UserRepository"),
  SendLogRepository: Symbol("SendLogRepository"),
  TranslationRepository: Symbol("TranslationRepository"),

  Logger: Symbol("Logger"),
  Translations: Symbol("Translations"),

  StashService: Symbol("StashService"),
  UserService: Symbol("UserService"),
  TranslationService: Symbol("TranslationService"),
};
