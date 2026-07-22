import nodemailer from "nodemailer";
import { decryptString } from "./passwordHelper";

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
    // Decrypt password — handle empty/unset credentials gracefully
    let password = "";
    try {
      password = config.passwordEncrypted ? decryptString(config.passwordEncrypted) : "";
    } catch {
      password = config.passwordEncrypted || "";
    }

    const transportOptions: any = {
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      connectionTimeout: 10000,
      socketTimeout: 15000,
      greetingTimeout: 10000,
      logger: false,
      debug: false,
    };

    // Only add auth block if credentials are provided
    if (config.username && password) {
      transportOptions.auth = {
        user: config.username,
        pass: password,
      };
    }

    // TLS options — allow self-signed certs for internal mail servers
    transportOptions.tls = {
      rejectUnauthorized: false,
      minVersion: "TLSv1",
    };

    return nodemailer.createTransport(transportOptions);
  }

  public static async verifyConnection(config: SmtpConfigInput): Promise<boolean> {
    if (!config.smtpHost || config.smtpHost === "localhost" || config.smtpHost === "") {
      console.warn("[SMTP] No SMTP host configured — skipping verification");
      return false;
    }
    try {
      const transporter = this.getTransporter(config);
      await transporter.verify();
      transporter.close();
      return true;
    } catch (err: any) {
      // Provide human-readable error context
      const msg = err?.message || String(err);
      if (msg.includes("ECONNREFUSED")) {
        console.error(`[SMTP] Connection refused on ${config.smtpHost}:${config.smtpPort} — is the SMTP server running?`);
      } else if (msg.includes("ENOTFOUND")) {
        console.error(`[SMTP] Host not found: ${config.smtpHost} — check DNS or hostname`);
      } else if (msg.includes("ESOCKET") || msg.includes("SSL") || msg.includes("TLS")) {
        console.error(`[SMTP] TLS/SSL handshake error on ${config.smtpHost}:${config.smtpPort} — try toggling Secure option`);
      } else if (msg.includes("535") || msg.includes("authentication") || msg.includes("credentials")) {
        console.error(`[SMTP] Authentication failed for ${config.username}@${config.smtpHost} — check credentials`);
      } else {
        console.error("[SMTP] Connection verification failed:", msg);
      }
      return false;
    }
  }

  public static async sendMailDirect(
    config: SmtpConfigInput,
    to: string,
    subject: string,
    html: string
  ): Promise<boolean> {
    if (!config.smtpHost || config.smtpHost === "localhost") {
      console.warn("[SMTP] SMTP host is not configured — email will not be sent");
      return false;
    }

    const transporter = this.getTransporter(config);
    try {
      const info = await transporter.sendMail({
        from: `"${config.senderName || "ALAMS"}" <${config.senderEmail}>`,
        to,
        subject,
        html,
      });
      console.log(`[SMTP] Email delivered to ${to}. Message-ID: ${info.messageId}`);
      return true;
    } catch (err: any) {
      const msg = err?.message || String(err);
      // Translate common SMTP server error codes to readable messages
      let readable = msg;
      if (msg.includes("ECONNREFUSED")) readable = `SMTP server refused connection on ${config.smtpHost}:${config.smtpPort}`;
      else if (msg.includes("ENOTFOUND")) readable = `SMTP host not found: ${config.smtpHost}`;
      else if (msg.includes("535")) readable = "SMTP authentication failed — invalid credentials";
      else if (msg.includes("550")) readable = "SMTP rejected recipient address";
      else if (msg.includes("ESOCKET")) readable = "TLS/SSL negotiation failed — try changing port or security mode";
      
      console.error(`[SMTP] Delivery failed to ${to}: ${readable}`);
      throw new Error(readable);
    } finally {
      transporter.close();
    }
  }
}
