import { Request, Response } from "express";
import prisma from "../prisma";
import { EmailGateway } from "../services/emailGateway";
import { SmtpGateway } from "../services/smtpGateway";
import { encryptString } from "../utils/crypto";

// Get Email Settings Configuration
export async function getEmailConfig(req: Request, res: Response) {
  try {
    const config = await EmailGateway.getActiveConfig();
    
    // Sanitize secrets before sending to admin UI
    return res.json({
      providerType: config.providerType,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      username: config.username,
      passwordSet: !!config.password,
      senderEmail: config.senderEmail,
      senderName: config.senderName,
      pilotMode: config.pilotMode,
      exchangeClientId: config.exchangeClientId,
      exchangeClientSecretSet: !!config.exchangeClientSecret,
      exchangeTenantId: config.exchangeTenantId,
      exchangeRedirectUri: config.exchangeRedirectUri
    });
  } catch (err: any) {
    console.error("Get email config error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Update Email Settings Configuration
export async function updateEmailConfig(req: Request, res: Response) {
  const {
    providerType,
    smtpHost,
    smtpPort,
    smtpSecure,
    username,
    password,
    senderEmail,
    senderName,
    pilotMode,
    exchangeClientId,
    exchangeClientSecret,
    exchangeTenantId,
    exchangeRedirectUri
  } = req.body;

  try {
    const existing = await EmailGateway.getActiveConfig();
    
    let encryptedPassword = existing.password;
    if (password && password !== "••••••••") {
      encryptedPassword = encryptString(password);
    }

    let encryptedExchangeSecret = existing.exchangeClientSecret;
    if (exchangeClientSecret && exchangeClientSecret !== "••••••••") {
      encryptedExchangeSecret = encryptString(exchangeClientSecret);
    }

    const updated = await prisma.emailConfig.update({
      where: { id: existing.id },
      data: {
        providerType: providerType ?? existing.providerType,
        smtpHost: smtpHost ?? existing.smtpHost,
        smtpPort: smtpPort !== undefined ? Number(smtpPort) : existing.smtpPort,
        smtpSecure: smtpSecure !== undefined ? Boolean(smtpSecure) : existing.smtpSecure,
        username: username ?? existing.username,
        password: encryptedPassword,
        senderEmail: senderEmail ?? existing.senderEmail,
        senderName: senderName ?? existing.senderName,
        pilotMode: pilotMode !== undefined ? Boolean(pilotMode) : existing.pilotMode,
        exchangeClientId: exchangeClientId ?? existing.exchangeClientId,
        exchangeClientSecret: encryptedExchangeSecret,
        exchangeTenantId: exchangeTenantId ?? existing.exchangeTenantId,
        exchangeRedirectUri: exchangeRedirectUri ?? existing.exchangeRedirectUri
      }
    });

    return res.json({ success: true, message: "Configuration updated successfully" });
  } catch (err: any) {
    console.error("Update email config error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Send Test Connection Email
export async function testEmailConnection(req: Request, res: Response) {
  const { testEmail } = req.body;

  if (!testEmail) {
    return res.status(400).json({ error: "Test email address is required" });
  }

  try {
    const config = await EmailGateway.getActiveConfig();
    const { subject, html } = EmailGateway.compileTemplate("TEST", {});

    const success = await EmailGateway.sendMailThroughProvider(config, testEmail, subject, html);

    if (success) {
      return res.json({ success: true, message: `Test email sent successfully to ${testEmail}` });
    } else {
      return res.status(500).json({ error: "Failed to dispatch test email." });
    }
  } catch (err: any) {
    console.error("Test SMTP connection error:", err);
    return res.status(500).json({ error: err.message || "Failed to establish mail server handshake." });
  }
}

// Fetch dashboard analytical stats
export async function getEmailDashboardStats(req: Request, res: Response) {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const config = await EmailGateway.getActiveConfig();

    // 1. SMTP Health Check
    const isHealthy = await EmailGateway.verifyProviderConnection(config);

    // 2. Queue States
    const queuePending = await prisma.emailQueue.count({ where: { status: "PENDING" } });
    const queueProcessing = await prisma.emailQueue.count({ where: { status: "PROCESSING" } });
    const queueFailed = await prisma.emailQueue.count({ where: { status: "FAILED" } });
    const queueSent = await prisma.emailQueue.count({ where: { status: "SENT" } });

    // 3. Sent Logs Stats
    const sentToday = await prisma.emailLog.count({
      where: {
        sentTime: { gte: startOfToday },
        status: "DELIVERED"
      }
    });

    const failedToday = await prisma.emailLog.count({
      where: {
        sentTime: { gte: startOfToday },
        status: "FAILED"
      }
    });

    // 4. OTP Stats
    const activeOtps = await prisma.otpVerification.count({ where: { status: "PENDING" } });
    const expiredOtps = await prisma.otpVerification.count({ where: { status: "EXPIRED" } });
    const lockedOtps = await prisma.otpVerification.count({ where: { status: "LOCKED" } });

    // 5. Searchable logs
    const emailLogs = await prisma.emailLog.findMany({
      orderBy: { sentTime: "desc" },
      take: 50
    });

    const otpLogs = await prisma.otpVerification.findMany({
      orderBy: { generatedTime: "desc" },
      take: 50
    });

    return res.json({
      health: {
        activeProvider: config.providerType,
        smtpConnection: isHealthy ? "ONLINE" : "OFFLINE",
        pilotMode: config.pilotMode
      },
      queue: {
        pending: queuePending,
        processing: queueProcessing,
        failed: queueFailed,
        sent: queueSent
      },
      sentToday,
      failedToday,
      otp: {
        active: activeOtps,
        expired: expiredOtps,
        locked: lockedOtps
      },
      logs: {
        emails: emailLogs,
        otps: otpLogs
      }
    });
  } catch (err: any) {
    console.error("Dashboard stats error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
