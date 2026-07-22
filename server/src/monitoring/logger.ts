import prisma from "../prisma";

// Structured Logger Utility
export const logger = {
  info: (message: string, meta?: any) => {
    const logObj = {
      level: "INFO",
      timestamp: new Date().toISOString(),
      message,
      ...(meta && { meta })
    };
    console.log(JSON.stringify(logObj));
  },
  warn: (message: string, meta?: any) => {
    const logObj = {
      level: "WARN",
      timestamp: new Date().toISOString(),
      message,
      ...(meta && { meta })
    };
    console.warn(JSON.stringify(logObj));
  },
  error: (message: string, err?: any, meta?: any) => {
    const logObj = {
      level: "ERROR",
      timestamp: new Date().toISOString(),
      message,
      ...(err && { error: err.message || err, stack: err.stack }),
      ...(meta && { meta })
    };
    console.error(JSON.stringify(logObj));
  }
};

// Database Audit Logging Helper
export async function createAuditLog(
  action: string,
  details: string,
  userId?: string,
  computerId?: string
) {
  try {
    const log = await prisma.auditLog.create({
      data: {
        action,
        details,
        userId: userId || null,
        computerId: computerId || null,
      },
    });
    logger.info(`[AUDIT LOG] ${action}: ${details}`, { logId: log.id, userId, computerId });
  } catch (err: any) {
    logger.error(`[AUDIT LOG ERROR] Failed to write audit log to database`, err, { action, details });
  }
}
