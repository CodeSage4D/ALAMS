import { Response } from "express";
import prisma from "../prisma";
import { AuthenticatedRequest } from "../middleware/auth";

/**
 * GET /api/v1/admin/analytics/pilot
 * Returns computed pilot KPI metrics:
 *   - Login success rate (successful sessions vs failed_login alerts)
 *   - Average QR unlock latency (ms) from sessions with latency recorded
 *   - Average PIN fallback latency (ms)
 *   - Hourly session distribution (last 24 hours)
 *   - Verification method breakdown (QR / PIN / ADMIN)
 *   - Watchdog enforcement count (watchdog_kill alerts)
 *   - Pilot deployment coverage (registered PCs vs 10-target)
 */
export async function getPilotAnalytics(req: AuthenticatedRequest, res: Response) {
  try {
    const [
      allSessions,
      failedLoginAlerts,
      watchdogAlerts,
      computers,
      sessions24h,
    ] = await Promise.all([
      prisma.session.findMany({
        select: {
          id: true,
          verificationMethod: true,
          unlockLatencyMs: true,
          loginTime: true,
          status: true,
        },
      }),
      prisma.securityAlert.count({
        where: { alertType: "failed_login" },
      }),
      prisma.securityAlert.count({
        where: { alertType: "watchdog_kill" },
      }),
      prisma.computer.findMany({
        select: {
          id: true,
          status: true,
          watchdogHeartbeat: true,
          lastSeen: true,
        },
      }),
      // Sessions in the last 24 hours for hourly breakdown
      prisma.session.findMany({
        where: {
          loginTime: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        select: {
          loginTime: true,
          verificationMethod: true,
        },
      }),
    ]);

    // --- Login Success Rate ---
    const successfulLogins = allSessions.filter(s => s.status !== "TERMINATED").length;
    const totalAttempts = successfulLogins + failedLoginAlerts;
    const loginSuccessRate =
      totalAttempts === 0 ? 100 : Math.round((successfulLogins / totalAttempts) * 1000) / 10;

    // --- Average Unlock Latency ---
    const qrSessions = allSessions.filter(
      s => s.verificationMethod === "QR_CODE" && s.unlockLatencyMs != null
    );
    const pinSessions = allSessions.filter(
      s => s.verificationMethod === "PIN_FALLBACK" && s.unlockLatencyMs != null
    );

    const avgQrLatencyMs =
      qrSessions.length > 0
        ? Math.round(qrSessions.reduce((sum, s) => sum + (s.unlockLatencyMs ?? 0), 0) / qrSessions.length)
        : null;

    const avgPinLatencyMs =
      pinSessions.length > 0
        ? Math.round(pinSessions.reduce((sum, s) => sum + (s.unlockLatencyMs ?? 0), 0) / pinSessions.length)
        : null;

    // --- Hourly Session Distribution (last 24 hours, 0-23) ---
    const hourlyCounts: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourlyCounts[h] = 0;
    sessions24h.forEach(s => {
      const hour = new Date(s.loginTime).getHours();
      hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
    });
    const hourlyDistribution = Object.entries(hourlyCounts).map(([hour, count]) => ({
      hour: Number(hour),
      count,
    }));

    // --- Verification Method Breakdown ---
    const qrCount = allSessions.filter(s => s.verificationMethod === "QR_CODE").length;
    const pinCount = allSessions.filter(s => s.verificationMethod === "PIN_FALLBACK").length;
    const adminCount = allSessions.filter(s => s.verificationMethod === "ADMIN_OVERRIDE").length;

    // --- Watchdog Health ---
    const now = Date.now();
    const watchdogActiveCount = computers.filter(
      c => c.watchdogHeartbeat && now - new Date(c.watchdogHeartbeat).getTime() < 20000
    ).length;
    const clientOnlineCount = computers.filter(
      c => c.lastSeen && now - new Date(c.lastSeen).getTime() < 15000
    ).length;

    return res.json({
      // Core KPIs
      loginSuccessRate,
      successfulLogins,
      failedLoginAlerts,
      totalAttempts,

      // Unlock Latency
      avgQrLatencyMs,
      avgPinLatencyMs,
      qrSampleCount: qrSessions.length,
      pinSampleCount: pinSessions.length,

      // Session distribution
      hourlyDistribution,
      sessions24hCount: sessions24h.length,

      // Verification breakdown
      verificationBreakdown: {
        QR_CODE: qrCount,
        PIN_FALLBACK: pinCount,
        ADMIN_OVERRIDE: adminCount,
        total: allSessions.length,
      },

      // Watchdog & Pilot coverage
      watchdogEnforcementCount: watchdogAlerts,
      watchdogActiveCount,
      clientOnlineCount,
      totalComputers: computers.length,
      pilotTarget: 10,
      deploymentProgress: Math.min(computers.length, 10),
    });
  } catch (err: any) {
    console.error("Analytics error:", err);
    return res.status(500).json({ error: "Failed to compute pilot analytics" });
  }
}

/**
 * POST /api/v1/client/failed-login
 * Called by the WPF client when a student enters wrong credentials.
 * Records a security alert and increments failure statistics.
 */
export async function recordFailedLogin(req: AuthenticatedRequest, res: Response) {
  const { computerId, enrollmentAttempt, method } = req.body;

  if (!computerId) {
    return res.status(400).json({ error: "Computer ID required" });
  }

  try {
    const alert = await prisma.securityAlert.create({
      data: {
        computerId,
        alertType: "failed_login",
        alertSeverity: "WARNING",
        details: `Failed ${method || "unknown"} authentication attempt. Enrollment input: ${enrollmentAttempt || "N/A"}`,
      },
    });

    return res.json({ status: "recorded", alertId: alert.id });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to record failed login" });
  }
}
