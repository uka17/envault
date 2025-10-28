import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { injectable, inject } from "tsyringe";
import { Repository } from "typeorm";

import User from "#model/User.js";
import LogService from "#service/LogService.js";
import config from "api/src/config/config.js";
import { TOKENS } from "#di/tokens.js";

@injectable()
export default class UserService {
  constructor(
    @inject(TOKENS.UserRepository) private userRepository: Repository<User>,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Creates a new user
   * @param newUser User object
   * @returns Created user object or null if error
   */
  public async createUser(newUser: User): Promise<User | null> {
    const createdUser = await this.userRepository.manager.save(newUser);

    const result = Object.assign({}, createdUser);
    delete result.password;

    return result;
  }
  /**
   * Create token for user
   * @param user User object
   * @returns Token string
   */
  public createToken(user: User): string {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + config.JWTMaxAge);
    return jwt.sign(
      {
        email: user.email,
        id: user.id,
        exp: Math.round(expirationDate.getTime() / 1000),
      },
      process.env.API_JWT_SECRET,
    );
  }
  /**
   * Returns user by id
   * @param userId User ID
   * @returns User or null if not found
   */
  public async getUserById(userId: number): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({
        where: {
          id: userId,
        },
      });
      const result = Object.assign({}, user);
      delete result.password;
      return result;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
  /**
   * Returns user by email
   * @param email User email
   * @returns User or null if not found
   */
  public async getUserByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({
        where: {
          email: email,
        },
      });
      if (!user) {
        return null;
      }
      delete user.password;
      return user;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Hashes a password
   * @param password Password to hash
   * @returns Hashed password
   * @throws Error if hashing fails
   */
  public getPasswordHash(password: string): string {
    return bcrypt.hashSync(password);
  }
}
