export const TOKENS = {
  StashRepository: Symbol("StashRepository"),
  UserRepository: Symbol("UserRepository"),
  SessionRepository: Symbol("SessionRepository"),
  SendLogRepository: Symbol("SendLogRepository"),
  EmailVerificationRepository: Symbol("EmailVerificationRepository"),

  LogService: Symbol("LogService"),
  StashService: Symbol("StashService"),
  StashSenderService: Symbol("StashSenderService"),
  UserService: Symbol("UserService"),
  EmailService: Symbol("EmailService"),
  EmailChangeService: Symbol("EmailChangeService"),
  EmailVerificationService: Symbol("EmailVerificationService"),

  UserController: Symbol("UserController"),
  StashController: Symbol("StashController"),
  PublicStashController: Symbol("PublicStashController"),

  UserValidator: Symbol("UserValidator"),
  StashValidator: Symbol("StashValidator"),
  PublicStashValidator: Symbol("PublicStashValidator"),

  EmailCredentialsProvider: Symbol("EmailCredentialsProvider"),
};
