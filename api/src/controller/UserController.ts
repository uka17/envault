import { injectable, inject } from "tsyringe";
import { Request, Response, NextFunction } from "express";
import passport from "passport";

import { TOKENS } from "di/tokens";
import { CODES, MESSAGES } from "lib/constants";

import User from "model/User";

import TranslationService from "service/TranslationService";
import UserService from "service/UserService";
import LogService from "service/LogService";
import ApiError from "lib/ApiError";

@injectable()
export default class UserController {
  constructor(
    @inject(TOKENS.UserService) private userService: UserService,
    @inject(TOKENS.TranslationService) private translationService: TranslationService,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Register new user
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async create(req: Request, res: Response, next: NextFunction) {
    // #swagger.summary = 'Register new user'
    // #swagger.tags = ['User']
    // #swagger.description = 'Register new user'
    /*  #swagger.parameters['body'] = {
          in: 'body',
          description: 'User',
          schema: {
              $email: 'john@mail.com',
              $password: 'secret@123',
              $name: 'Jhon Doe',
          }
  } */
    try {
      const { email, password, name } = req.body as {
        email: string;
        password: string;
        name: string;
      };
      const user = req.user as User;

      // Create a new user
      const newUser = new User();
      newUser.name = name;
      newUser.email = email;
      newUser.password = this.userService.getPasswordHash(password);
      newUser.createdBy = user;
      newUser.modifiedBy = user;

      const createdUser = await this.userService.createUser(newUser);

      if (createdUser !== null) {
        return res.status(CODES.API_CREATED).json(createdUser);
      } else {
        throw new Error(MESSAGES.USER_WAS_NOT_CREATED);
      }
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }
  /**
   * Login user
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async login(req: Request, res: Response, next: NextFunction) {
    // #swagger.summary = 'Login user'
    /*  #swagger.parameters['body'] = {
            in: 'body',
            description: 'User',
            schema: {
                $email: 'john@mail.com',
                $password: 'secret@123',
            }
      } */
    try {
      // In fact route returns result of callback
      return passport.authenticate(
        "local",
        { session: false },
        async(err: Error, passportUser: User) => {
          /* istanbul ignore next */ if (err) {
            this.logger.error(err as object);
            res
              .status(CODES.SERVER_ERROR)
              .send({ error: this.translationService.getText("error_500") });
          }

          if (passportUser) {
            return res.json({ token: this.userService.createToken(passportUser) });
          }

          return res.status(CODES.API_UNAUTHORIZED).json({
            error: this.translationService.getText("incorrect_password_or_email"),
          });
        },
      )(req, res, next);
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }
  /**
   * Returns currently logged in user
   * @param req Request object
   * @param res Response object
   * @param next Next function
   */
  public async whoami(req: Request, res: Response, next: NextFunction) {
    // #swagger.summary = 'Fetch currently current user'
    try {
      const id = (req.user as User).id;

      const result = await this.userService.getUserById(id);

      /* istanbul ignore next */ if (result === null) {
        throw new ApiError(CODES.API_UNAUTHORIZED, MESSAGES.API_UNAUTHORIZED_ERROR, [
          this.translationService.getText("incorrect_token"),
        ]);
      } else {
        return res.status(CODES.API_OK).json(result);
      }
    } catch (e: unknown) /* istanbul ignore next */ {
      next(e);
    }
  }
}
