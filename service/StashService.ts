import { DataSource, DeleteResult } from "typeorm";
import { Repository } from "typeorm";
import * as CryptoJS from "crypto-js";
import Mail from "nodemailer/lib/mailer";
import { customAlphabet } from "nanoid";

import { Stash } from "../model/Stash";
import { SendLog } from "../model/SendLog";
import { User } from "model/User";

import { Logger } from "../lib/Logger";
import config from "api/src/config/config";

export default class StashService {
  private dataSource: DataSource;
  private logger: Logger;
  private stashRepository: Repository<Stash>;
  private sendLogRepository: Repository<SendLog>;

  constructor(dataSource: DataSource, logger: Logger) {
    this.dataSource = dataSource;
    this.stashRepository = this.dataSource.manager.getRepository(Stash);
    this.sendLogRepository = this.dataSource.manager.getRepository(SendLog);
    this.logger = logger;
  }

  /**
   * Logs the email message ID to the database
   * @param stashId ID of the stash
   * @param mailOptions Mail options object which contains to, from, subject, html and text fields
   * @param messageId Message ID of the email received from AWS SES
   */
  public async log(
    stashId: number,
    mailOptions: Mail.Options,
    messageId: string
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
      const logRecord = await this.sendLogRepository.manager.save(sendLog);
      return logRecord;
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
      const createdStash = await this.stashRepository.manager.save(newStash);
      return createdStash;
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
      const stashes = await this.stashRepository.find({
        where: {
          user: {
            id: userId,
          },
        },
      });
      return stashes;
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
      const stash = await this.stashRepository.findOne({
        where: {
          id: stashId,
        },
      });
      return stash;
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
      const result = await this.stashRepository.delete({ id: stashId });
      return result;
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
    modifiedBy: User
  ): Promise<Stash | null> {
    try {
      const stash = await this.getStash(stashId);
      if (!stash) {
        return null;
      }
      stash.sendAt.setHours(stash.sendAt.getHours() + hours);
      stash.modifiedBy = modifiedBy;
      stash.modifiedOn = new Date(Date.now());
      const updatedStash = await this.stashRepository.manager.save(stash);
      return updatedStash;
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
    return CryptoJS.AES.encrypt(body, key).toString();
  }

  /**
   * Generates a random stash key
   * @returns Random stash key
   */
  public generateStashKey(): string {
    const nanoid = customAlphabet(
      config.stashNanoId.alphabet,
      config.stashNanoId.length
    );
    return nanoid();
  }
}
