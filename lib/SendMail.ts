import { Logger } from "./logger";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";
import { Transporter } from "nodemailer";
import Mail from "nodemailer/lib/mailer";
import { AwsCredentialIdentityProvider } from "@smithy/types";

export default class SendMail {
  private sesClient: SESClient;
  private logger: Logger;
  private transporter: Transporter;

  /**
   * Creates instance of `SendMail` object which can send emails via sendinblue.com
   * @param credentials aws credentials provider
   * @param logger Logger object
   */
  constructor(logger: Logger, credentials: AwsCredentialIdentityProvider) {
    this.logger = logger;
    this.sesClient = new SESClient({
      region: "eu-north-1",
      credentials: credentials,
    });
    this.transporter = nodemailer.createTransport({
      SES: { ses: this.sesClient, aws: { SendRawEmailCommand } },
    });
  }
  /**
   *
   * @param mailOptions Mail options object which contains to, from, subject, html and text fields
   */
  public async send(mailOptions: Mail.Options) {
    try {
      this.logger.info(`Sending email to ${mailOptions.to}...`);
      this.transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          this.logger.error(error);
        }
        this.logger.info(`Email sent: ${info.response}`);
      });
    } catch (error) {
      this.logger.error(error);
    }
  }
}
