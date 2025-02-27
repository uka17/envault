import { DataSource } from "typeorm";
import { Logger } from "../lib/Logger";
import Mail from "nodemailer/lib/mailer";
import { Stash } from "../model/Stash";
import { SendLog } from "../model/SendLog";
import { Repository } from "typeorm";

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
      sendLog.message_id = messageId;
      await this.dataSource.manager.save(sendLog);
    } catch (error) {
      this.logger.error(error);
    }
  }
}
