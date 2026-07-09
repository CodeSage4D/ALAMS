import prisma from "../prisma";

export interface BehaviorMetrics {
  computerId: string;
  cpuUsage: number;
  ramUsage: number;
  sessionDurationMinutes?: number;
  failedPinAttemptsCount?: number;
}

/**
 * Stub function representing AI behavioral analytics model evaluation.
 * In the future, this will invoke a machine learning service to check if the session behavior is anomalous.
 */
export async function evaluateWorkstationBehavior(metrics: BehaviorMetrics): Promise<{ flagged: boolean; reason?: string }> {
  const { cpuUsage, ramUsage, sessionDurationMinutes, failedPinAttemptsCount } = metrics;

  let flagged = false;
  let reason = "";

  // Heuristic rule-based anomaly detection (simulating ML classification)
  if (cpuUsage > 95 && ramUsage > 95) {
    flagged = true;
    reason = "Simulated anomaly: Prolonged extreme resource consumption (possible unauthorized compute/abuse).";
  } else if (failedPinAttemptsCount && failedPinAttemptsCount >= 3) {
    flagged = true;
    reason = "Simulated anomaly: Repeated invalid verification PIN attempts.";
  } else if (sessionDurationMinutes && sessionDurationMinutes > 240) {
    flagged = true;
    reason = "Simulated anomaly: Session active for unusually long duration (exceeding standard lab slots).";
  }

  if (flagged) {
    // Record security alert
    await prisma.securityAlert.create({
      data: {
        computerId: metrics.computerId,
        alertType: "behavior_anomaly",
        alertSeverity: "WARNING",
        details: `AI Behavior Flag: ${reason}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "AI_ANOMALY_FLAG",
        computerId: metrics.computerId,
        details: `Behavior anomaly flagged on workstation. Reason: ${reason}`,
      },
    });
  }

  return { flagged, reason: flagged ? reason : undefined };
}
