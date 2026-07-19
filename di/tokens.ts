export const TOKENS = {
  StashRepository: Symbol("StashRepository"),
  UserRepository: Symbol("UserRepository"),
  SessionRepository: Symbol("SessionRepository"),
  SendLogRepository: Symbol("SendLogRepository"),

  LogService: Symbol("LogService"),
  StashService: Symbol("StashService"),
  UserService: Symbol("UserService"),
  EmailService: Symbol("EmailService"),

  UserController: Symbol("UserController"),
  StashController: Symbol("StashController"),
  PublicStashController: Symbol("PublicStashController"),

  UserValidator: Symbol("UserValidator"),
  StashValidator: Symbol("StashValidator"),
  PublicStashValidator: Symbol("PublicStashValidator"),

  EmailCredentialsProvider: Symbol("EmailCredentialsProvider"),
};
