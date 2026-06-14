import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as crypto from "crypto";
import { injectable, inject } from "tsyringe";
import { Repository } from "typeorm";

import User from "#model/User.js";
import LogService from "#service/LogService.js";
import config from "api/src/config/config.js";
import { TOKENS } from "#di/tokens.js";

@injectable()
export default class UserService {
  /**
   * Creates instance of `UserService`
   * @param userRepository User repository
   * @param logger Logger service
   */
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
   * Create access token for user (short-lived)
   * @param user User object
   * @returns Signed JWT string
   */
  public createToken(user: User): string {
    const expirationDate = new Date();
    expirationDate.setMinutes(expirationDate.getMinutes() + config.JWTAccessMaxAgeMinutes);
    return jwt.sign(
      {
        email: user.email,
        sub: user.id,
        exp: Math.round(expirationDate.getTime() / 1000),
      },
      process.env.API_JWT_SECRET,
    );
  }

  /**
   * Generate a random refresh token, persist its hash for the user, and return the raw token
   * @param user User object
   * @returns Raw refresh token string to be stored in cookie
   */
  public async createRefreshToken(user: User): Promise<string> {
    const raw = crypto.randomBytes(64).toString("hex");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    await this.userRepository.update(user.id, { refreshToken: hash });
    return raw;
  }

  /**
   * Verify a raw refresh token against the stored hash and return the user if valid
   * @param raw Raw refresh token from cookie
   * @returns User if valid, null otherwise
   */
  public async verifyRefreshToken(raw: string): Promise<User | null> {
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const user = await this.userRepository.findOne({ where: { refreshToken: hash } });
    return user ?? null;
  }

  /**
   * Invalidate the stored refresh token for a user
   * @param userId User ID
   */
  public async revokeRefreshToken(userId: number): Promise<void> {
    await this.userRepository.update(userId, { refreshToken: null });
  }
  /**
   * Returns user by id
   * @param userId User ID
   * @returns User or `null` if not found or error
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
   * @returns User or `null` if not found or error
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
