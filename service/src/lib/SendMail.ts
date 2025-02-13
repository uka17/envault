import { Logger } from "../../../lib/logger";

export default class SendMail {
  private sender: { name: string; email: string };
  private apiKey: string;
  private logger: Logger;

  /**
   * Creates instance of `SendMail` object which can send emails via sendinblue.com
   * @param sender Name and email of sender
   * @param apiKey sendinblue.com API key
   * @param logger Logger object
   */
  constructor(
    sender: { name: string; email: string },
    apiKey: string,
    logger: Logger
  ) {
    this.sender = sender;
    this.apiKey = apiKey;
    this.logger = logger;
  }
  /**
   *
   * @param to Name and email of recipient
   * @param subject Subject of email
   * @param htmlContent Html body of email
   */
  public send(
    to: { name: string; email: string },
    subject: string,
    htmlContent: string
  ) {
    try {
      this.logger.info(`Sending email to ${to.email}...`);
    } catch (error) {
      this.logger.error(error);
    }
  }
}
