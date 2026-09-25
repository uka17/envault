import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";
import { injectable, inject } from "tsyringe";
import { Transporter } from "nodemailer";
import { AwsCredentialIdentityProvider } from "@smithy/types";

import LogService from "#service/LogService.js";
import { TOKENS } from "#di/tokens.js";
import config from "api/src/config/config.js";

const TEST_RECIPIENT = ["ukaoneseven", "gmail.com"].join("@");
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;
const TIMEOUT_CODES = ["ETIMEDOUT", "ESOCKETTIMEDOUT"];

/** Safe category of a failed send, stored and logged instead of provider message text. */
export type EmailErrorCategory = "timeout" | "send_failed";

/**
 * Result of an email submission: provider message ID with the recipient the email was actually
 * sent to (the test recipient in DEV), or a safe failure category.
 */
export type EmailSendResult = { messageId: string; to: string } | { error: EmailErrorCategory };

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
      requestHandler: {
        connectionTimeout: config.emailTimeout.connectionMs,
        requestTimeout: config.emailTimeout.requestMs,
      },
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
    const result = await this.sendWithResult(mailOptions);
    return "messageId" in result ? result.messageId : null;
  }

  /**
   * Sends email like `send`, but reports a safe failure category instead of `null`.
   * A timeout is an ambiguous result: the provider may still have accepted the email.
   * @param mailOptions Mail options object which contains to, from, subject, html and text fields
   * @returns Message ID received from AWS SES with the actual recipient, or the failure category
   */
  public async sendWithResult(mailOptions: nodemailer.SendMailOptions): Promise<EmailSendResult> {
    const isDev = process.env.ENV === "DEV";
    if (isDev) {
      this.logger.warn(`DEV env, replacing ${mailOptions.to} with test recipient ${TEST_RECIPIENT}`);
    }
    const finalOptions = { ...mailOptions, to: isDev ? TEST_RECIPIENT : mailOptions.to };
    try {
      this.logger.info(`Sending email to ${finalOptions.to}...`);
      const info = await this.transporter.sendMail(finalOptions);
      if (info.messageId) {
        return { messageId: info.messageId, to: finalOptions.to as string };
      }
      this.logger.error("Email delivery failed: category=send_failed reason=no_message_id");
      return { error: "send_failed" };
    } catch (error) {
      const { category, details } = this.describeError(error);
      this.logger.error(`Email delivery failed: category=${category}${details}`);
      return { error: category };
    }
  }

  /**
   * Extracts safe diagnostic fields from a transport error. The error message is never used:
   * transport errors can contain the message body, including authentication links.
   * @param error Error thrown by the transport
   * @returns Failure category and a log suffix with the safe fields that are present
   */
  private describeError(error: unknown): { category: EmailErrorCategory; details: string } {
    const source = (error ?? {}) as {
      name?: unknown; code?: unknown; Code?: unknown;
      $metadata?: { httpStatusCode?: unknown; requestId?: unknown };
    };
    const fields: Record<string, unknown> = {
      name: source.name,
      code: source.code ?? source.Code,
      httpStatus: source.$metadata?.httpStatusCode,
      awsRequestId: source.$metadata?.requestId,
    };
    const details = Object.entries(fields)
      .filter(([, value]) => (typeof value === "string" || typeof value === "number") && SAFE_TOKEN.test(String(value)))
      .map(([key, value]) => ` ${key}=${value}`)
      .join("");
    const isTimeout = source.name === "TimeoutError" ||
      (typeof fields.code === "string" && TIMEOUT_CODES.includes(fields.code));
    return { category: isTimeout ? "timeout" : "send_failed", details };
  }
}
