import prisma from "../prisma";
import { SmtpGateway } from "./smtpGateway";

export interface EmailTemplatePayload {
  studentName?: string;
  enrollmentNumber?: string;
  workstationName?: string;
  loginTime?: string;
  otpCode?: string;
  resetLink?: string;
  alertDetails?: string;
  alertSeverity?: string;
  customMessage?: string;
}

export class EmailGateway {
  public static compileTemplate(templateName: string, payload: EmailTemplatePayload): { subject: string; html: string } {
    let subject = "";
    let body = "";

    const cardStyles = `
      style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; color: #f3f4f6;"
    `;
    const headerStyles = `
      style="padding: 24px; background: #0d1527; border-bottom: 1px solid #1f2937; text-align: center;"
    `;
    const contentStyles = `
      style="padding: 32px; line-height: 1.6;"
    `;
    const footerStyles = `
      style="padding: 24px; background: #0d1527; border-top: 1px solid #1f2937; text-align: center; font-size: 11px; color: #6b7280;"
    `;
    const otpBoxStyles = `
      style="margin: 24px auto; width: fit-content; padding: 16px 32px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 12px; font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #34d399; font-family: monospace;"
    `;

    const getBaseHtml = (title: string, content: string) => `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="background: #04060d; padding: 40px 20px; margin: 0;">
          <div ${cardStyles}>
            <div ${headerStyles}>
              <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #34d399; letter-spacing: 1px;">SCSIT ALAMS</h2>
            </div>
            <div ${contentStyles}>
              <h3 style="margin-top: 0; color: #ffffff; font-size: 18px; font-weight: 700;">${title}</h3>
              ${content}
            </div>
            <div ${footerStyles}>
              Symbiosis University of Applied Sciences, Indore<br>
              SCSIT Lab Access Management System • Automated Authentication Gateway
            </div>
          </div>
        </body>
      </html>
    `;

    switch (templateName) {
      case "OTP_VERIFICATION":
        subject = "ALAMS Verification Code";
        body = getBaseHtml(
          "One-Time Verification Passcode",
          `
            <p>Hello <strong style="color: #ffffff;">${payload.studentName || "Student"}</strong> (${payload.enrollmentNumber}),</p>
            <p>A verification request was initiated for your profile on workstation <strong style="color: #ffffff;">${payload.workstationName || "PC-XX"}</strong> at ${payload.loginTime || new Date().toLocaleTimeString()}.</p>
            <p>Use the following 6-digit verification code to unlock your workstation session:</p>
            <div ${otpBoxStyles}>${payload.otpCode}</div>
            <p style="color: #ef4444; font-size: 13px; font-weight: 600;">⚠️ Security Notice: This code is valid for exactly 60 seconds and is restricted for single-use authentication only. Never share this code with anyone.</p>
          `
        );
        break;

      case "PASSWORD_RESET":
        subject = "ALAMS Account Password Reset";
        body = getBaseHtml(
          "Password Reset Instruction",
          `
            <p>Hello,</p>
            <p>A request to reset the password for account <strong style="color: #ffffff;">${payload.enrollmentNumber}</strong> has been received.</p>
            <p>Click the link below to verify your identity and set a new secure password:</p>
            <p style="margin: 24px 0;"><a href="${payload.resetLink}" style="padding: 12px 24px; background: #10b981; color: #0b0f19; font-weight: 800; text-decoration: none; border-radius: 8px; font-size: 14px;">Reset Password</a></p>
            <p>If you did not request this change, please contact your systems administrator immediately.</p>
          `
        );
        break;

      case "WELCOME":
        subject = "Welcome to ALAMS Portal";
        body = getBaseHtml(
          "Welcome Student",
          `
            <p>Hello <strong style="color: #ffffff;">${payload.studentName || "Student"}</strong>,</p>
            <p>Your academic account has been registered on the Symbiosis Lab Access Management System (ALAMS).</p>
            <p>Your login enrollment username is: <strong style="color: #ffffff;">${payload.enrollmentNumber}</strong></p>
            <p>You can now sit at any SCSIT workstation and request access using your enrollment email OTP.</p>
          `
        );
        break;

      case "ACCOUNT_CREATED":
        subject = "ALAMS Profile Provisioned";
        body = getBaseHtml(
          "Account Provisioned",
          `
            <p>Hello <strong style="color: #ffffff;">${payload.studentName || "Student"}</strong>,</p>
            <p>An administrator has provisioned your student account. Please find your details below:</p>
            <ul>
              <li>Enrollment: ${payload.enrollmentNumber}</li>
              <li>Generated Password: ${payload.otpCode} (Temporary)</li>
            </ul>
            <p>You will be prompted to set a new password upon your first login attempt.</p>
          `
        );
        break;

      case "PASSWORD_CHANGED":
        subject = "ALAMS Password Security Notice";
        body = getBaseHtml(
          "Password Changed Successfully",
          `
            <p>Hello,</p>
            <p>This is to inform you that the login password for account <strong style="color: #ffffff;">${payload.enrollmentNumber}</strong> was updated on ${payload.loginTime || new Date().toLocaleString()}.</p>
            <p style="color: #f59e0b;">If you did not perform this update, please report this incident to the lab supervisors immediately.</p>
          `
        );
        break;

      case "SECURITY_ALERT":
        subject = `ALAMS Security Alert: ${payload.alertSeverity || "WARNING"}`;
        body = getBaseHtml(
          "Security Threat Alert",
          `
            <p>An access anomaly has been detected on workstation <strong style="color: #ffffff;">${payload.workstationName}</strong>.</p>
            <div style="padding: 16px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; font-size: 13px; color: #f87171;">
              <strong>Details:</strong> ${payload.alertDetails}
            </div>
            <p>Severity: <strong style="color: #f87171;">${payload.alertSeverity}</strong></p>
          `
        );
        break;

      case "TEST":
      default:
        subject = "ALAMS SMTP Test Gateway";
        body = getBaseHtml(
          "SMTP Integration Successful",
          `
            <p>This is a verification test confirming that your ALAMS SMTP Mail Gateway is fully active.</p>
            <p>Configured parameters are verified, and delivery queues are functional.</p>
            <p>Timestamp: ${new Date().toLocaleString()}</p>
          `
        );
        break;
    }

    return { subject, html: body };
  }

  public static async enqueueEmail(
    recipient: string,
    templateName: string,
    payload: EmailTemplatePayload
  ): Promise<boolean> {
    try {
      const { subject } = this.compileTemplate(templateName, payload);
      
      await prisma.emailQueue.create({
        data: {
          recipient,
          subject,
          template: templateName,
          payload: JSON.stringify(payload),
          status: "PENDING",
        },
      });

      return true;
    } catch (err) {
      console.error("Failed to enqueue email:", err);
      return false;
    }
  }

  public static async getActiveConfig() {
    let config = await prisma.emailConfig.findFirst();
    if (!config) {
      config = await prisma.emailConfig.create({
        data: {
          providerType: "SMTP",
          smtpHost: "localhost",
          smtpPort: 587,
          smtpSecure: false,
          username: "",
          password: "",
          senderEmail: "noreply@suas.ac.in",
          senderName: "ALAMS Authentication",
          pilotMode: true,
        },
      });
    }
    return config;
  }
}
