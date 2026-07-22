import { Request, Response } from "express";
import prisma from "../prisma";
import { verifyQRToken, compareValue, hashValue } from "../auth/passwordHelper";
import { unlockComputer } from "../websocket";
import { AuthEngine } from "../auth/authEngine";
import { createAuditLog } from "../monitoring/logger";
import { AttendanceStatus } from "@prisma/client";
import crypto from "crypto";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    enrollmentNumber: string;
    role: string;
  };
}

// --- VERIFY MOBILE UNLOCK (QR SCAN FROM APP) ---
export async function verifyMobileUnlock(req: AuthenticatedRequest, res: Response) {
  const { qrToken } = req.body;
  const user = req.user;

  if (!qrToken) {
    return res.status(400).json({ error: "QR token required" });
  }

  if (!user) {
    return res.status(401).json({ error: "Student session invalid" });
  }

  try {
    let payload;
    try {
      payload = verifyQRToken(qrToken);
    } catch (e: any) {
      return res.status(400).json({ error: "QR Code expired or invalid. Please scan again." });
    }

    const { computerId } = payload;

    const computer = await prisma.computer.findUnique({
      where: { id: computerId },
    });

    if (!computer) {
      return res.status(404).json({ error: "Workstation not registered" });
    }

    // Ensure student does not have another active session elsewhere
    const activeStudentSession = await prisma.session.findFirst({
      where: {
        userId: user.userId,
        status: "ACTIVE",
      },
    });

    if (activeStudentSession) {
      await createAuditLog(
        "CONCURRENT_LOGIN_REJECT",
        `Rejected QR login for student ${user.enrollmentNumber} because they have an active session on workstation ID ${activeStudentSession.computerId}`,
        user.userId,
        computerId
      );

      return res.status(400).json({
        error: "Active session already detected on another workstation.",
      });
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentHours = String(now.getHours()).padStart(2, "0");
    const currentMinutes = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${currentHours}:${currentMinutes}`;

    const slot = await prisma.timetableSlot.findFirst({
      where: {
        labId: computer.labId,
        dayOfWeek: currentDay,
        startTime: { lte: currentTime },
        endTime: { gte: currentTime },
      },
      include: {
        subject: true,
        faculty: true,
      },
    });

    let late = false;
    if (slot) {
      const [startH, startM] = slot.startTime.split(":").map(Number);
      const classStartDate = new Date(now);
      classStartDate.setHours(startH, startM, 0, 0);
      const diffMinutes = (now.getTime() - classStartDate.getTime()) / 60000;
      late = diffMinutes > 15;
    }

    const oneTimePin = Math.floor(100000 + Math.random() * 900000).toString();
    const pinExpiresAt = new Date(Date.now() + 60000);

    const verifyTimestamp = Date.now();
    const latencyMs = typeof payload.timestamp === "number" ? verifyTimestamp - payload.timestamp : null;

    const session = await prisma.session.create({
      data: {
        userId: user.userId,
        computerId: computer.id,
        verificationMethod: "QR_CODE",
        status: "PENDING",
        unlockLatencyMs: latencyMs ?? undefined,
        oneTimePin,
        pinExpiresAt,
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
        timetableSlotId: slot?.id ?? null,
      },
    });

    return res.json({
      message: "One-Time Session PIN generated successfully",
      pin: oneTimePin,
      expiresIn: 60,
      classInfo: slot ? {
        subjectName: slot.subject.name,
        subjectCode: slot.subject.code,
        facultyName: slot.faculty.fullName,
        semester: slot.semester,
        branch: slot.branch,
        section: slot.section,
        batch: slot.batch,
        late,
      } : null,
    });
  } catch (err: any) {
    console.error("Mobile unlock error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- VERIFY SESSION PIN (SUBMITTED FROM WORKSTATION SCREEN) ---
export async function verifySessionPIN(req: Request, res: Response) {
  const { computerId, oneTimePin } = req.body;

  if (!computerId || !oneTimePin) {
    return res.status(400).json({ error: "Computer ID and PIN required" });
  }

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const failedAttemptsCount = await prisma.securityAlert.count({
      where: {
        computerId,
        alertType: "failed_pin_verification",
        alertTime: { gte: fiveMinutesAgo },
        resolved: false,
      },
    });

    if (failedAttemptsCount >= 3) {
      await prisma.securityAlert.create({
        data: {
          computerId,
          alertType: "brute_force_pin_lockout",
          alertSeverity: "CRITICAL",
          details: `Brute force lockout: Workstation PIN verification locked due to ${failedAttemptsCount} failed attempts.`,
        },
      });

      await prisma.authAudit.create({
        data: {
          method: "QR_CODE",
          source: "WPF_CLIENT_PIN_ENTRY",
          loginTime: new Date(),
          clientIp: req.ip || "127.0.0.1",
          computerId,
          status: "FAILED",
          failureReason: "Brute force lockout triggered",
          riskLevel: "HIGH",
          auditReferenceId: crypto.randomUUID()
        }
      });

      return res.status(429).json({ error: "Workstation is locked due to too many failed PIN entry attempts. Please contact administrative staff." });
    }

    const session = await prisma.session.findFirst({
      where: {
        computerId,
        oneTimePin,
        status: "PENDING",
      },
      include: {
        user: { select: { id: true, enrollmentNumber: true } },
        computer: true,
      },
    });

    if (!session) {
      await prisma.securityAlert.create({
        data: {
          computerId,
          alertType: "failed_pin_verification",
          alertSeverity: "WARNING",
          details: `Failed session PIN "${oneTimePin}" validation attempt.`,
        },
      });

      await prisma.authAudit.create({
        data: {
          method: "QR_CODE",
          source: "WPF_CLIENT_PIN_ENTRY",
          loginTime: new Date(),
          clientIp: req.ip || "127.0.0.1",
          computerId,
          status: "FAILED",
          failureReason: "Invalid PIN code",
          riskLevel: "MEDIUM",
          auditReferenceId: crypto.randomUUID()
        }
      });

      return res.status(401).json({ error: "Invalid PIN code." });
    }

    if (session.pinExpiresAt && new Date() > session.pinExpiresAt) {
      await prisma.authAudit.create({
        data: {
          method: "QR_CODE",
          source: "WPF_CLIENT_PIN_ENTRY",
          loginTime: new Date(),
          clientIp: req.ip || "127.0.0.1",
          computerId,
          studentId: session.user.enrollmentNumber,
          status: "FAILED",
          failureReason: "PIN code expired",
          riskLevel: "LOW",
          auditReferenceId: crypto.randomUUID()
        }
      });
      return res.status(401).json({ error: "PIN code has expired. Please scan QR again." });
    }

    const loginTime = new Date();
    const auditReferenceId = crypto.randomUUID();

    await prisma.session.update({
      where: { id: session.id },
      data: {
        status: "ACTIVE",
        oneTimePin: null,
        pinExpiresAt: null,
        loginTime,
        ipAddress: req.ip || session.computer.ipAddress || "127.0.0.1",
        auditReferenceId
      },
    });

    let isLate = false;
    if (session.timetableSlotId) {
      const slot = await prisma.timetableSlot.findUnique({
        where: { id: session.timetableSlotId }
      });
      if (slot) {
        const [startH, startM] = slot.startTime.split(":").map(Number);
        const classStartDate = new Date(loginTime);
        classStartDate.setHours(startH, startM, 0, 0);
        const diffMinutes = (loginTime.getTime() - classStartDate.getTime()) / 60000;
        isLate = diffMinutes > 15;
      }
    }

    await prisma.attendance.create({
      data: {
        userId: session.userId,
        sessionId: session.id,
        status: isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        checkIn: loginTime,
        lateEntry: isLate,
        subjectId: session.subjectId,
        facultyId: session.facultyId,
      },
    });

    await prisma.computer.update({
      where: { id: computerId },
      data: { status: "ACTIVE" },
    });

    unlockComputer(computerId, session.user.enrollmentNumber);

    await prisma.authAudit.create({
      data: {
        method: "QR_CODE",
        source: "MOBILE_APP",
        loginTime,
        clientIp: req.ip || session.computer.ipAddress || "127.0.0.1",
        macAddress: session.computer.macAddress,
        computerId: session.computer.id,
        deviceName: session.computer.deviceName,
        studentId: session.user.enrollmentNumber,
        status: "SUCCESS",
        riskLevel: "LOW",
        auditReferenceId
      }
    });

    await createAuditLog("STUDENT_LOGIN", `Student ${session.user.enrollmentNumber} successfully completed 2FA PIN unlock on workstation ${session.computer.deviceName}`, session.userId, computerId);

    return res.json({
      success: true,
      message: "Session authenticated successfully",
      enrollmentNumber: session.user.enrollmentNumber,
      sessionId: session.id,
    });
  } catch (err: any) {
    console.error("verifySessionPIN error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- VERIFY LOCAL PIN/PASSWORD AUTH (BYPASS AUTH ON WORKSTATION LOCK SCREEN) ---
export async function verifyLocalPINAuth(req: Request, res: Response) {
  const { enrollmentNumber, pin, computerId, authMethod } = req.body;

  if (!enrollmentNumber || !pin || !computerId) {
    return res.status(400).json({ error: "Enrollment Number, Password, and Computer ID are required" });
  }

  // Format validations
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const studentRegex = /^ENR[a-zA-Z0-9]+$/i;
  if (!emailRegex.test(enrollmentNumber) && !studentRegex.test(enrollmentNumber)) {
    return res.status(400).json({ error: "Invalid Enrollment Number/Email format" });
  }

  if (pin.length < 6) {
    return res.status(400).json({ error: "Password or PIN must be at least 6 characters long" });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(computerId)) {
    return res.status(400).json({ error: "Invalid Computer ID format" });
  }

  try {
    const computer = await prisma.computer.findUnique({
      where: { id: computerId },
    });

    if (!computer) {
      return res.status(404).json({ error: "Computer not registered" });
    }

    if (!computer.fallbackEnabled) {
      return res.status(403).json({ error: "Bypass authentication is disabled for this computer" });
    }

    const targetMethod = authMethod === "OFFLINE_LOGIN" ? "OFFLINE_LOGIN" : "ONLINE_PASSWORD";
    const auditReferenceId = crypto.randomUUID();
    const clientIp = req.ip || computer.ipAddress || "127.0.0.1";

    const authResult = await AuthEngine.authenticate(targetMethod, enrollmentNumber, pin, {
      computerId,
      ipAddress: clientIp,
      source: "WPF_CLIENT"
    });

    if (!authResult.success) {
      await prisma.authAudit.create({
        data: {
          method: targetMethod,
          source: "WPF_CLIENT",
          loginTime: new Date(),
          clientIp,
          macAddress: computer.macAddress,
          computerId,
          deviceName: computer.deviceName,
          studentId: enrollmentNumber,
          status: "FAILED",
          failureReason: authResult.error || "Invalid credentials",
          riskLevel: authResult.riskLevel,
          auditReferenceId
        }
      });

      return res.status(401).json({ error: authResult.error || "Invalid password or PIN" });
    }

    const user = authResult.user!;

    // Ensure student does not have another active session elsewhere
    const activeStudentSession = await prisma.session.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
    });

    if (activeStudentSession) {
      await prisma.authAudit.create({
        data: {
          method: targetMethod,
          source: "WPF_CLIENT",
          loginTime: new Date(),
          clientIp,
          macAddress: computer.macAddress,
          computerId,
          deviceName: computer.deviceName,
          studentId: user.enrollmentNumber,
          status: "FAILED",
          failureReason: "Duplicate active session on another workstation",
          riskLevel: "MEDIUM",
          auditReferenceId
        }
      });

      await createAuditLog(
        "CONCURRENT_LOGIN_REJECT",
        `Rejected fallback login for student ${user.enrollmentNumber} because they have an active session on workstation ID ${activeStudentSession.computerId}`,
        user.id,
        computerId
      );
      return res.status(400).json({
        error: "Active session already detected on another workstation.",
      });
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentHours = String(now.getHours()).padStart(2, "0");
    const currentMinutes = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${currentHours}:${currentMinutes}`;

    const slot = await prisma.timetableSlot.findFirst({
      where: {
        labId: computer.labId,
        dayOfWeek: currentDay,
        startTime: { lte: currentTime },
        endTime: { gte: currentTime },
      },
    });

    let late = false;
    if (slot) {
      const [startH, startM] = slot.startTime.split(":").map(Number);
      const classStartDate = new Date(now);
      classStartDate.setHours(startH, startM, 0, 0);
      const diffMinutes = (now.getTime() - classStartDate.getTime()) / 60000;
      late = diffMinutes > 15;
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        computerId: computer.id,
        verificationMethod: targetMethod,
        status: "ACTIVE",
        ipAddress: clientIp,
        auditReferenceId,
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
        timetableSlotId: slot?.id ?? null,
      },
    });

    await prisma.attendance.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        status: late ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        checkIn: now,
        lateEntry: late,
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
      },
    });

    await prisma.computer.update({
      where: { id: computer.id },
      data: { status: "ACTIVE" },
    });

    unlockComputer(computer.id, user.enrollmentNumber);

    await prisma.authAudit.create({
      data: {
        method: targetMethod,
        source: "WPF_CLIENT",
        loginTime: now,
        clientIp,
        macAddress: computer.macAddress,
        computerId: computer.id,
        deviceName: computer.deviceName,
        studentId: user.enrollmentNumber,
        status: "SUCCESS",
        riskLevel: "LOW",
        auditReferenceId
      }
    });

    await createAuditLog(
      targetMethod === "OFFLINE_LOGIN" ? "STUDENT_LOGIN_OFFLINE" : "STUDENT_LOGIN_PASSWORD",
      `Student ${user.enrollmentNumber} unlocked workstation ${computer.deviceName} via credentials check (${targetMethod})`,
      user.id,
      computerId
    );

    return res.json({
      message: "Workstation unlocked successfully",
      user: {
        fullName: user.fullName,
        enrollmentNumber: user.enrollmentNumber,
      },
      sessionId: session.id,
    });
  } catch (err: any) {
    console.error("Local login auth error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- CLIENT LOGOUT ---
export async function clientLogout(req: Request, res: Response) {
  const { computerId, sessionId } = req.body;

  if (!computerId || !sessionId) {
    return res.status(400).json({ error: "Computer ID and Session ID required" });
  }

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { enrollmentNumber: true } } },
    });

    if (!session || session.status !== "ACTIVE") {
      return res.status(404).json({ error: "Active session not found" });
    }

    const logoutTime = new Date();
    const durationMinutes = Math.round((logoutTime.getTime() - session.loginTime.getTime()) / 60000);

    let earlyExit = false;
    if (session.timetableSlotId) {
      const slot = await prisma.timetableSlot.findUnique({ where: { id: session.timetableSlotId } });
      if (slot) {
        const [endH, endM] = slot.endTime.split(":").map(Number);
        const classEndDate = new Date(session.loginTime);
        classEndDate.setHours(endH, endM, 0, 0);
        earlyExit = logoutTime.getTime() < classEndDate.getTime() - 5 * 60 * 1000;
      }
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        logoutTime,
        durationMinutes,
      },
    });

    const attendance = await prisma.attendance.findFirst({
      where: { sessionId },
    });
    if (attendance) {
      let finalStatus: AttendanceStatus = AttendanceStatus.PRESENT;
      if (durationMinutes < 15) {
        finalStatus = AttendanceStatus.ABSENT;
      } else if (durationMinutes < 45) {
        finalStatus = AttendanceStatus.PARTIAL;
      } else if (attendance.status === AttendanceStatus.LATE) {
        finalStatus = AttendanceStatus.LATE;
      }

      await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOut: logoutTime,
          status: finalStatus,
          duration: durationMinutes,
          earlyExit,
          practicalHours: parseFloat((durationMinutes / 60.0).toFixed(1)),
        },
      });
    }

    await prisma.computer.update({
      where: { id: computerId },
      data: { status: "APPROVED" },
    });

    if (session.auditReferenceId) {
      await prisma.authAudit.update({
        where: { auditReferenceId: session.auditReferenceId },
        data: {
          logoutTime,
          durationMinutes,
        }
      }).catch(err => console.error("Failed to update AuthAudit on logout:", err));
    }

    await createAuditLog(
      "STUDENT_LOGOUT",
      `Student ${session.user.enrollmentNumber} logged out. Duration: ${durationMinutes} mins. Attendance: ${attendance ? attendance.status : "N/A"}`,
      session.userId,
      computerId
    );

    return res.json({ message: "Logout registered successfully" });
  } catch (err: any) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- SYNC OFFLINE SESSION RECORD ---
export async function syncOfflineSession(req: Request, res: Response) {
  const {
    transactionId,
    computerId,
    enrollmentNumber,
    loginTime,
    logoutTime,
    durationMinutes,
    verificationMethod,
    ipAddress,
    macAddress,
    signature,
    clockTampered
  } = req.body;

  if (!computerId || !enrollmentNumber || !loginTime || !logoutTime) {
    return res.status(400).json({ error: "Missing required session synchronization parameters" });
  }

  try {
    const computer = await prisma.computer.findUnique({
      where: { id: computerId },
      include: { lab: true },
    });

    if (!computer) {
      return res.status(404).json({ error: "Workstation is not registered on this server" });
    }

    const user = await prisma.user.findUnique({
      where: { enrollmentNumber },
    });

    if (!user) {
      return res.status(404).json({ error: "Student profile matching sync payload not found" });
    }

    const parsedLogin = new Date(loginTime);
    const parsedLogout = new Date(logoutTime);
    const calculatedDuration = durationMinutes || Math.round((parsedLogout.getTime() - parsedLogin.getTime()) / 60000);

    const currentDay = parsedLogin.getDay();
    const currentHours = String(parsedLogin.getHours()).padStart(2, "0");
    const currentMinutes = String(parsedLogin.getMinutes()).padStart(2, "0");
    const currentTime = `${currentHours}:${currentMinutes}`;

    const slot = await prisma.timetableSlot.findFirst({
      where: {
        labId: computer.labId,
        dayOfWeek: currentDay,
        startTime: { lte: currentTime },
        endTime: { gte: currentTime },
      },
    });

    let late = false;
    if (slot) {
      const [startH, startM] = slot.startTime.split(":").map(Number);
      const classStartDate = new Date(parsedLogin);
      classStartDate.setHours(startH, startM, 0, 0);
      const diffMinutes = (parsedLogin.getTime() - classStartDate.getTime()) / 60000;
      late = diffMinutes > 15;
    }

    let earlyExit = false;
    if (slot) {
      const [endH, endM] = slot.endTime.split(":").map(Number);
      const classEndDate = new Date(parsedLogin);
      classEndDate.setHours(endH, endM, 0, 0);
      earlyExit = parsedLogout.getTime() < classEndDate.getTime() - 5 * 60 * 1000;
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        computerId: computer.id,
        verificationMethod: "OFFLINE_LOGIN",
        status: "COMPLETED",
        loginTime: parsedLogin,
        logoutTime: parsedLogout,
        durationMinutes: calculatedDuration,
        ipAddress: ipAddress || computer.ipAddress || "127.0.0.1",
        auditReferenceId: transactionId || crypto.randomUUID(),
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
        timetableSlotId: slot?.id ?? null,
      }
    });

    let attendanceStatus: AttendanceStatus = AttendanceStatus.PRESENT;
    if (calculatedDuration < 15) {
      attendanceStatus = AttendanceStatus.ABSENT;
    } else if (calculatedDuration < 45) {
      attendanceStatus = AttendanceStatus.PARTIAL;
    } else if (late) {
      attendanceStatus = AttendanceStatus.LATE;
    }

    await prisma.attendance.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        status: attendanceStatus,
        checkIn: parsedLogin,
        checkOut: parsedLogout,
        duration: calculatedDuration,
        lateEntry: late,
        earlyExit: earlyExit,
        practicalHours: parseFloat((calculatedDuration / 60.0).toFixed(1)),
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
      }
    });

    await prisma.authAudit.create({
      data: {
        method: "OFFLINE_LOGIN",
        source: "WPF_CLIENT_SYNC",
        loginTime: parsedLogin,
        logoutTime: parsedLogout,
        durationMinutes: calculatedDuration,
        clientIp: ipAddress || computer.ipAddress || "127.0.0.1",
        macAddress: macAddress || computer.macAddress,
        computerId: computer.id,
        deviceName: computer.deviceName,
        studentId: user.enrollmentNumber,
        status: "SUCCESS",
        riskLevel: "LOW",
        auditReferenceId: transactionId || crypto.randomUUID()
      }
    });

    await createAuditLog(
      "OFFLINE_SESSION_SYNC",
      `Synchronized offline session for student ${user.enrollmentNumber} on PC ${computer.deviceName}. Duration: ${calculatedDuration} mins.`,
      user.id,
      computer.id
    );

    return res.json({ success: true, message: "Offline session synchronized successfully" });
  } catch (err: any) {
    console.error("Offline session synchronization failed:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- WATCHDOG HEARTBEAT ---
export async function watchdogHeartbeat(req: Request, res: Response) {
  const { computerId } = req.body;

  if (!computerId) {
    return res.status(400).json({ error: "Computer ID required" });
  }

  try {
    const pc = await prisma.computer.update({
      where: { id: computerId },
      data: { watchdogHeartbeat: new Date() },
    });

    return res.json({ status: "success", lastSeen: pc.watchdogHeartbeat });
  } catch (err: any) {
    return res.status(404).json({ error: "Computer not found" });
  }
}

// --- WATCHDOG ALERT RECIEVER ---
export async function watchdogAlert(req: Request, res: Response) {
  const { computerId, alertType, details, severity } = req.body;

  if (!computerId || !alertType) {
    return res.status(400).json({ error: "Computer ID and Alert Type are required" });
  }

  const computer = await prisma.computer.findUnique({
    where: { id: computerId }
  });

  if (!computer) {
    console.warn(`[WATCHDOG ALERT] Rejected security alert from unregistered computer ID: ${computerId}`);
    return res.status(404).json({ error: "Workstation not registered" });
  }

  try {
    const alert = await prisma.securityAlert.create({
      data: {
        computerId,
        alertType,
        alertSeverity: severity || "CRITICAL",
        details: details || "Watchdog generated security log alert",
      },
    });

    await prisma.computer.update({
      where: { id: computerId },
      data: { status: "APPROVED" },
    });

    await prisma.session.updateMany({
      where: { computerId, status: "ACTIVE" },
      data: { status: "TERMINATED", logoutTime: new Date() },
    });

    await createAuditLog(
      "WATCHDOG_ALERT_TRIGGERED",
      `Watchdog reported alert "${alertType}" (${severity}) on computer ${computer.deviceName}. Active sessions terminated.`,
      undefined,
      computerId
    );

    return res.json({ status: "success", alertId: alert.id });
  } catch (err: any) {
    console.error("Watchdog alert API error:", err);
    return res.status(500).json({ error: "Failed to record security alert" });
  }
}

// --- GET ACTIVE ACTIVE SESSIONS (Admin Dashboard) ---
export async function getActiveSessions(req: AuthenticatedRequest, res: Response) {
  try {
    const activeSessions = await prisma.session.findMany({
      where: { status: "ACTIVE" },
      include: {
        user: { select: { fullName: true, enrollmentNumber: true } },
        computer: { select: { pcNumber: true, deviceName: true, lab: { select: { name: true } } } },
      },
      orderBy: { loginTime: "desc" },
    });
    return res.json(activeSessions);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch active sessions" });
  }
}

// --- SCAN DYNAMIC QR & AUTO-REGISTER STUDENT ON-THE-FLY ---
export async function registerAndUnlock(req: Request, res: Response) {
  const { qrToken, fullName, email, enrollmentNumber } = req.body;

  if (!qrToken || !fullName || !email || !enrollmentNumber) {
    return res.status(400).json({ error: "All parameters are required (qrToken, fullName, email, enrollmentNumber)" });
  }

  if (!email.endsWith("@suas.ac.in")) {
    return res.status(400).json({ error: "Only SUAS email addresses (@suas.ac.in) are permitted." });
  }

  try {
    let payload;
    try {
      payload = verifyQRToken(qrToken);
    } catch (e: any) {
      return res.status(400).json({ error: "QR Code expired or invalid. Please scan again." });
    }

    const { computerId } = payload;

    const computer = await prisma.computer.findUnique({
      where: { id: computerId },
      include: { lab: true },
    });

    if (!computer) {
      return res.status(404).json({ error: "Workstation not registered" });
    }

    let user = await prisma.user.findUnique({
      where: { enrollmentNumber },
    });

    if (!user) {
      user = await prisma.user.findFirst({
        where: { enrollmentNumber: email },
      });
    }

    if (!user) {
      const tempPass = Math.random().toString(36).substring(2, 10);
      const tempPin = Math.floor(100000 + Math.random() * 900000).toString();
      const passwordHash = await hashValue(tempPass);
      const pinHash = await hashValue(tempPin);

      user = await prisma.user.create({
        data: {
          enrollmentNumber,
          fullName,
          email,
          passwordHash,
          pinHash,
          role: "STUDENT",
          isActive: true,
          mustChangePassword: false,
        },
      });

      console.log(`[AUTH] Auto-registered new student user: ${enrollmentNumber}`);
    } else {
      if (user.fullName !== fullName) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { fullName },
        });
      }
    }

    const activeStudentSession = await prisma.session.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
    });

    if (activeStudentSession) {
      return res.status(400).json({
        error: "Active session already detected on another workstation.",
      });
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentHours = String(now.getHours()).padStart(2, "0");
    const currentMinutes = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${currentHours}:${currentMinutes}`;

    const slot = await prisma.timetableSlot.findFirst({
      where: {
        labId: computer.labId,
        dayOfWeek: currentDay,
        startTime: { lte: currentTime },
        endTime: { gte: currentTime },
      },
    });

    const oneTimePin = Math.floor(100000 + Math.random() * 900000).toString();
    const pinExpiresAt = new Date(Date.now() + 60000);

    await prisma.session.create({
      data: {
        userId: user.id,
        computerId: computer.id,
        verificationMethod: "QR_CODE",
        status: "PENDING",
        oneTimePin,
        pinExpiresAt,
        subjectId: slot?.subjectId ?? null,
        facultyId: slot?.facultyId ?? null,
        timetableSlotId: slot?.id ?? null,
      },
    });

    return res.json({
      success: true,
      message: "Student registration matched. Session PIN generated.",
      pin: oneTimePin,
      expiresInSeconds: 60,
      labName: computer.lab?.name || "SUAS Lab",
      pcNumber: computer.pcNumber,
    });
  } catch (err: any) {
    console.error("registerAndUnlock error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- GET SECURITY LOGS / ALERTS ---
export async function getSecurityAlerts(req: AuthenticatedRequest, res: Response) {
  try {
    const alerts = await prisma.securityAlert.findMany({
      include: {
        computer: { select: { pcNumber: true, deviceName: true } },
        session: { include: { user: { select: { enrollmentNumber: true } } } },
      },
      orderBy: { alertTime: "desc" },
    });
    return res.json(alerts);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to retrieve security logs" });
  }
}

// --- RESOLVE SECURITY ALERT ---
export async function resolveAlert(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  try {
    const alert = await prisma.securityAlert.update({
      where: { id },
      data: { resolved: true },
    });
    return res.json(alert);
  } catch (err: any) {
    return res.status(404).json({ error: "Alert not found" });
  }
}
