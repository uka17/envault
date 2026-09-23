import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";
import { injectable, inject } from "tsyringe";
import { Transporter } from "nodemailer";
import { AwsCredentialIdentityProvider } from "@smithy/types";

import LogService from "#service/LogService.js";
import { TOKENS } from "#di/tokens.js";
import config from "api/src/config/config.js";

const TEST_RECIPIENT = ["ukaoneseven", "gmail.com"].join("@");

@injectable()
export default class EmailService {
  private sesClient: SESClient;
  private transporter: Transporter;

  /**
   * Creates instance of `EmailService` object which can send emails via AWS SES
   * @param logger Logger service
   * @param credentials AWS credentials provider
   */
  constructor(
    @inject(TOKENS.LogService) private logger: LogService,
    @inject(TOKENS.EmailCredentialsProvider) private credentials: AwsCredentialIdentityProvider,
  ) {
    this.logger = logger;
    this.sesClient = new SESClient({
      region: config.awsRegion,
      credentials: this.credentials,
    });
    this.transporter = nodemailer.createTransport({
      SES: { ses: this.sesClient, aws: { SendRawEmailCommand } },
    });
  }
  /**
   * Sends email using nodemailer and AWS SES. In the DEV environment, every message is
   * redirected to a fixed test recipient instead of its real `to` address, so local
   * development never delivers to a real user's inbox.
   * @param mailOptions Mail options object which contains to, from, subject, html and text fields
   * @returns Message ID of the email received from AWS SES or `null` if error
   */
  public async send(mailOptions: nodemailer.SendMailOptions): Promise<string | null> {
    const isDev = process.env.ENV === "DEV";
    if (isDev) {
      this.logger.warn(`DEV env, replacing ${mailOptions.to} with test recipient ${TEST_RECIPIENT}`);
    }
    const finalOptions = { ...mailOptions, to: isDev ? TEST_RECIPIENT : mailOptions.to };
    try {
      this.logger.info(`Sending email to ${finalOptions.to}...`);
      const info = await this.transporter.sendMail(finalOptions);
      return info.messageId || null;
    } catch {
      // Transport errors can contain the message body, including authentication links.
      this.logger.error("Email delivery failed");
      return null;
    }
  }
}
