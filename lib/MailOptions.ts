export default class MailOptions {
  public to: { name: string; email: string };
  public from: { name: string; email: string };
  public subject: string;
  public html: string;
  public text: string;

  /** Creates instance of `MailOptions` object which can be used to send emails
   * @param to Name and email of recipient
   * @param from Name and email of sender
   * @param subject Subject of email
   * @param html Html body of email
   * @param text Text body of email
   */
  constructor(
    to: { name: string; email: string },
    from: { name: string; email: string },
    subject: string,
    html: string,
    text: string,
  ) {
    this.to = to;
    this.from = from;
    this.subject = subject;
    this.html = html;
    this.text = text;
  }
}
