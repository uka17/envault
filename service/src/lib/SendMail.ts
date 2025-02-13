const SibApiV3Sdk = require("sib-api-v3-typescript");
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
      let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
      let apiKey = apiInstance.authentications["apiKey"];
      apiKey.apiKey = this.apiKey;

      let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = htmlContent;
      sendSmtpEmail.sender = this.sender;
      sendSmtpEmail.to = [to];

      apiInstance.sendTransacEmail(sendSmtpEmail).then(
        (data) => {
          this.logger.info(
            "API called successfully. Returned data: " + JSON.stringify(data)
          );
        },
        (error) => {
          this.logger.error(error);
        }
      );
    } catch (error) {
      this.logger.error(error);
    }
  }
}
