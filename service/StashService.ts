import { DeleteResult, Repository } from "typeorm";
import AES from "crypto-js/aes.js";
import nodemailer from "nodemailer";
import { customAlphabet } from "nanoid";
import { injectable, inject } from "tsyringe";

import Stash from "#model/Stash.js";
import SendLog from "#model/SendLog.js";
import User from "#model/User.js";
import { TOKENS } from "#di/tokens.js";

import LogService from "#service/LogService.js";
import config from "api/src/config/config.js";

@injectable()
export default class StashService {
  constructor(
    @inject(TOKENS.StashRepository) private stashRepository: Repository<Stash>,
    @inject(TOKENS.SendLogRepository) private sendLogRepository: Repository<SendLog>,
    @inject(TOKENS.LogService) private logger: LogService,
  ) {}

  /**
   * Logs the email message ID to the database
   * @param stashId ID of the stash
   * @param mailOptions Mail options object which contains to, from, subject, html and text fields
   * @param messageId Message ID of the email received from AWS SES
   */
  public async log(
    stashId: number,
    mailOptions: nodemailer.SendMailOptions,
    messageId: string,
  ) {
    try {
      const stash = await this.stashRepository.findOne({
        where: {
          id: stashId,
        },
      });
      const sendLog = new SendLog();
      sendLog.stash = stash;
      sendLog.messageId = messageId;
      //TODO: add mailOptions to sendLog
      return await this.sendLogRepository.manager.save(sendLog);
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Creates a new stash
   * @param newStash Stash object
   * @returns Created stash object or null if error
   */
  public async createStash(newStash: Stash): Promise<Stash | null> {
    try {
      return await this.stashRepository.manager.save(newStash);
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Searches for all stash objects for a user
   * @param userId User ID
   * @returns Stash object or empty array if not found or null if error
   */
  public async getUserStashes(userId: number): Promise<Stash[] | null> {
    try {
      return await this.stashRepository.find({
        where: {
          user: {
            id: userId,
          },
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Searches for stash object by ID
   * @param stashId
   * @returns  Stash object or null if error or not found
   */
  public async getStash(stashId: number): Promise<Stash | null> {
    try {
      return await this.stashRepository.findOne({
        where: {
          id: stashId,
        },
      });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Deletes stash object by ID
   * @param stashId
   * @returns  Number of rows affected or null if error
   */
  public async deleteStash(stashId: number): Promise<DeleteResult | null> {
    try {
      return await this.stashRepository.delete({ id: stashId });
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Snoozes the stash by changing the sendAt date
   * @param stashId Stash ID
   * @param hours Number of hours to snooze
   * @param modifiedBy User who modified the stash
   * @returns  Updated stash object or null if error or not found
   */
  public async snoozeStash(
    stashId: number,
    hours: number,
    modifiedBy: User,
  ): Promise<Stash | null> {
    try {
      const stash = await this.getStash(stashId);
      if (!stash) {
        return null;
      }
      stash.sendAt.setHours(stash.sendAt.getHours() + hours);
      stash.modifiedBy = modifiedBy;
      stash.modifiedOn = new Date(Date.now());
      return await this.stashRepository.manager.save(stash);
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  /**
   * Encrypts the stash body using the key
   * @param body Stash body
   * @param key Key to encrypt the stash body
   */
  public encryptBody(body: string, key: string): string {
    return AES.encrypt(body, key).toString();
  }

  /**
   * Generates a random stash key
   * @returns Random stash key
   */
  public generateStashKey(): string {
    const nanoid = customAlphabet(
      config.stashNanoId.alphabet,
      config.stashNanoId.length,
    );
    return nanoid();
  }
}
