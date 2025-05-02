import { DataSource } from "typeorm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Repository } from "typeorm";
import User from "../model/User";
import { Logger } from "../lib/Logger";
import config from "../api/src/config/config";

export default class UserService {
  private dataSource: DataSource;
  private logger: Logger;
  private userRepository: Repository<User>;

  constructor(dataSource: DataSource, logger: Logger) {
    this.dataSource = dataSource;
    this.userRepository = this.dataSource.manager.getRepository(User);
    this.logger = logger;
  }

  /**
   * Creates a new user
   * @param newUser User object
   * @returns Created user object or null if error
   */
  public async createUser(newUser: User): Promise<User | null> {
    try {
      const createdUser = await this.userRepository.manager.save(newUser);

      const result = Object.assign({}, createdUser);
      delete result.password;

      return result;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
  /**
   * Create token for user
   * @param user User object
   * @returns Token string
   */
  public createToken(user: User): string {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + config.JWTMaxAge);
    const token = jwt.sign(
      {
        email: user.email,
        id: user.id,
        exp: Math.round(expirationDate.getTime() / 1000),
      },
      process.env.API_JWT_SECRET
    );
    return token;
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
   * @param userId User email
   * @returns User or null if not found
   */
  public async getUserByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({
        where: {
          email: email,
        },
      });
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
