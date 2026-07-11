import nodemailer from "nodemailer";
import { decryptString } from "../utils/crypto";

export interface SmtpConfigInput {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  passwordEncrypted: string;
  senderEmail: string;
  senderName: string;
}

export class SmtpGateway {
  private static getTransporter(config: SmtpConfigInput) {
    const password = decryptString(config.passwordEncrypted);
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.username,
        pass: password,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5,
      timeout: 10000,
    } as any);
  }

  public static async verifyConnection(config: SmtpConfigInput): Promise<boolean> {
    try {
      const transporter = this.getTransporter(config);
      await transporter.verify();
      transporter.close();
      return true;
    } catch (err) {
      console.error("SMTP Connection verification failed:", err);
      return false;
    }
  }

  public static async sendMailDirect(
    config: SmtpConfigInput,
    to: string,
    subject: string,
    html: string
  ): Promise<boolean> {
    const transporter = this.getTransporter(config);
    try {
      const info = await transporter.sendMail({
        from: `"${config.senderName}" <${config.senderEmail}>`,
        to,
        subject,
        html,
      });
      console.log(`Email delivered successfully to ${to}. Message ID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.error(`SMTP delivery failed to ${to}:`, err);
      throw err;
    } finally {
      transporter.close();
    }
  }
}
