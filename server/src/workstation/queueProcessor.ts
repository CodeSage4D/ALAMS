import prisma from "../prisma";
import { EmailGateway, EmailTemplatePayload } from "../auth/emailGateway";
import { SmtpGateway } from "../auth/smtpGateway";

let queueInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;

export function startBackgroundWorkers() {
  console.log("[INFO] Starting ALAMS Phase 6 Background Services...");
  
  queueInterval = setInterval(processEmailQueue, 15000);
  cleanupInterval = setInterval(cleanupExpiredOtps, 30000);
  healthCheckInterval = setInterval(runSmtpHealthCheck, 300000);

  processEmailQueue();
  cleanupExpiredOtps();
  runSmtpHealthCheck();
}

export function stopBackgroundWorkers() {
  if (queueInterval) clearInterval(queueInterval);
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  console.log("[INFO] ALAMS Background Services halted.");
}

async function processEmailQueue() {
  try {
    const now = new Date();
    const pendingItems = await prisma.emailQueue.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        retryCount: { lt: 5 },
        OR: [
          { nextRetry: null },
          { nextRetry: { lte: now } }
        ]
      },
      take: 10
    });

    if (pendingItems.length === 0) return;

    console.log(`[Queue] Processing ${pendingItems.length} queued emails...`);
    const config = await EmailGateway.getActiveConfig();

    for (const item of pendingItems) {
      await prisma.emailQueue.update({
        where: { id: item.id },
        data: { status: "PROCESSING", lastAttempt: now }
      });

      let recipient = item.recipient;
      if (config.pilotMode) {
        recipient = "karan.mishra@suas.ac.in";
      }

      try {
        const payload: EmailTemplatePayload = JSON.parse(item.payload);
        const { html } = EmailGateway.compileTemplate(item.template, payload);

        const sent = await EmailGateway.sendMailThroughProvider(config, recipient, item.subject, html);

        if (sent) {
          await prisma.emailQueue.update({
            where: { id: item.id },
            data: { status: "SENT", processedAt: new Date(), errorDetails: null }
          });

          await prisma.emailLog.create({
            data: {
              recipient: item.recipient,
              subject: item.subject,
              template: item.template,
              status: "DELIVERED",
              provider: config.providerType,
              deliveryTime: new Date(),
            }
          });
        }
      } catch (err: any) {
        console.error(`[Queue] Delivery failed for item ID ${item.id}:`, err.message);
        
        const nextRetryCount = item.retryCount + 1;
        const delaySeconds = nextRetryCount * 120;
        const nextRetryDate = new Date(Date.now() + delaySeconds * 1000);

        await prisma.emailQueue.update({
          where: { id: item.id },
          data: {
            status: nextRetryCount >= 5 ? "FAILED" : "PENDING",
            retryCount: nextRetryCount,
            nextRetry: nextRetryCount >= 5 ? null : nextRetryDate,
            errorDetails: err.message || "Unknown delivery error"
          }
        });

        await prisma.emailLog.create({
          data: {
            recipient: item.recipient,
            subject: item.subject,
            template: item.template,
            status: "FAILED",
            provider: config.providerType,
            errorDetails: err.message || "Unknown delivery error"
          }
        });
      }
    }
  } catch (err) {
    console.error("[Queue] Queue processor loop exception:", err);
  }
}

async function cleanupExpiredOtps() {
  try {
    const now = new Date();
    const deletedCount = await prisma.otpVerification.deleteMany({
      where: {
        OR: [
          { expiryTime: { lt: now } },
          { status: { in: ["EXPIRED", "LOCKED", "VERIFIED"] } }
        ]
      }
    });
    if (deletedCount.count > 0) {
      console.log(`[Cleanup] Pruned ${deletedCount.count} expired/inactive OTP records.`);
    }
  } catch (err) {
    console.error("[Cleanup] OTP clean worker error:", err);
  }
}

async function runSmtpHealthCheck() {
  try {
    const config = await EmailGateway.getActiveConfig();
    const isHealthy = await EmailGateway.verifyProviderConnection(config);
    console.log(`[Health] Active Provider (${config.providerType}) Health Check: ${isHealthy ? "ONLINE (Connected)" : "OFFLINE (Unreachable)"}`);
  } catch (err) {
    console.error("[Health] Connection test failed:", err);
  }
}
