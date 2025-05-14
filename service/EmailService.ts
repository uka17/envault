import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";
import { injectable, inject } from "tsyringe";
import { Transporter } from "nodemailer";
import Mail from "nodemailer/lib/mailer";
import { AwsCredentialIdentityProvider } from "@smithy/types";

import LogService from "service/LogService";
import { TOKENS } from "di/tokens";

//TODO DI for this service
@injectable()
export default class EmailService {
  private sesClient: SESClient;
  private transporter: Transporter;

  /**
   * Creates instance of `SendMail` object which can send emails via sendinblue.com
   * @param credentials aws credentials provider
   */
  constructor(
    @inject(TOKENS.LogService) private logger: LogService,
    @inject(TOKENS.EmailCredentialsProvider) private credentials: AwsCredentialIdentityProvider,
  ) {
    this.logger = logger;
    this.sesClient = new SESClient({
      region: "eu-north-1",
      credentials: this.credentials,
    });
    this.transporter = nodemailer.createTransport({
      SES: { ses: this.sesClient, aws: { SendRawEmailCommand } },
    });
  }
  /**
   * Sends email using nodemailer and AWS SES
   * @param mailOptions Mail options object which contains to, from, subject, html and text fields
   * @returns Message ID of the email received from AWS SES or `null` if error
   */
  public async send(mailOptions: Mail.Options): Promise<string | null> {
    try {
      this.logger.info(`Sending email to ${mailOptions.to}...`);
      const info = await this.transporter.sendMail(mailOptions);
      return info.messageId || null;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
}
